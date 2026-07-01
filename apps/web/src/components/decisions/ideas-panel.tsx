import {
  type Activity,
  type ChecklistItem,
  type ItemType,
  positionBetween,
  type TripSnapshot,
} from "@caravan/shared";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Lightbulb, ListChecks, MapPin, Plus, StickyNote } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useMemo, useState } from "react";
import { ActivityFormDialog } from "@/components/itinerary/activity-form-dialog";
import { deriveDays } from "@/components/itinerary/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useIdeaLists, useMyMember, useTripMutation } from "@/lib/sync";
import { ActivityFooter } from "./activity-footer";
import { DraggableIdeaCard, IdeaCard } from "./idea-card";
import {
  DroppableUnlistedSection,
  SortableIdeaListSection,
  UNLISTED_DROP_ID,
} from "./idea-list-section";
import {
  commentsFor,
  useCommentsByTarget,
  useMemberColors,
  useMembersById,
  useVotesByActivity,
} from "./use-decisions";

type DialogState =
  | { mode: "create"; defaultType: ItemType; defaultListId: string | null }
  | { mode: "edit"; activity: Activity }
  | null;

/**
 * Ideas & Lists — the Decide surface's idea pool (C.4), now organized into
 * user-defined **lists** (D10) and carrying **freeform idea types** (D1: note +
 * checklist) alongside activity ideas. Ideas are still undated candidates the
 * group votes on; an idea joins a list via `activities.listId`. Lists are
 * collapsible, reorderable groups; an idea with no list falls to **Unlisted**.
 *
 * Reuses the shared idea card / vote / comment footer (`IdeaCard` →
 * `ActivityCard` for activity ideas, its own glyph+body for note/checklist) and
 * the single `ActivityFormDialog` (type + idea-list selectors) for create/edit.
 */
export function IdeasPanel({ snapshot, canEdit }: { snapshot: TripSnapshot; canEdit: boolean }) {
  const { trip, activities } = snapshot;
  const { mutateAsync } = useTripMutation();
  const me = useMyMember();
  const { ideaLists, createList, renameList, reorderList, deleteList } = useIdeaLists();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [creatingList, setCreatingList] = useState(false);
  const [listDraft, setListDraft] = useState("");
  // Cross-list idea drag (V2.3): what's lifted, and which section it's over.
  // `dropTargetKey` is a list id, `UNLISTED_DROP_ID`, or null (not over a new
  // home); it drives the section highlight + reads back on drop.
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    type: "idea" | "list-section";
  } | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const days = useMemo(
    () => deriveDays(trip.startDate, trip.endDate, activities),
    [trip.startDate, trip.endDate, activities],
  );

  const votesByActivity = useVotesByActivity(snapshot.votes);
  const commentsByTarget = useCommentsByTarget(snapshot.comments);
  const membersById = useMembersById(snapshot.members);
  const colors = useMemberColors(snapshot.members);

  // All undated candidates. Grouping + per-list sort happen below.
  const ideas = useMemo(() => activities.filter((a) => a.date === null), [activities]);

  // Most-wanted first within a group (ties keep fractional order — PD-2).
  const sortByVotes = useCallback(
    (pool: Activity[]): Activity[] =>
      [...pool].sort((a, b) => {
        const va = votesByActivity.get(a.id)?.length ?? 0;
        const vb = votesByActivity.get(b.id)?.length ?? 0;
        if (va !== vb) return vb - va;
        return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
      }),
    [votesByActivity],
  );

  // Bucket each idea into its list, plus an "Unlisted" bucket. A stale listId
  // (list just deleted) reads as Unlisted, matching the ON DELETE SET NULL rule.
  const { byList, unlisted } = useMemo(() => {
    const listIds = new Set(ideaLists.map((l) => l.id));
    const byListMap = new Map<string, Activity[]>();
    const unlistedArr: Activity[] = [];
    for (const idea of ideas) {
      if (idea.listId && listIds.has(idea.listId)) {
        const arr = byListMap.get(idea.listId) ?? [];
        arr.push(idea);
        byListMap.set(idea.listId, arr);
      } else {
        unlistedArr.push(idea);
      }
    }
    return { byList: byListMap, unlisted: unlistedArr };
  }, [ideas, ideaLists]);

  // Valid card-drop targets: any real list id (over.id from a section's sortable
  // node) plus the Unlisted sentinel. Anything else read off `over` is ignored.
  const listIdSet = useMemo(() => new Set(ideaLists.map((l) => l.id)), [ideaLists]);
  const resolveDropKey = useCallback(
    (overId: string): string | null =>
      overId === UNLISTED_DROP_ID ? UNLISTED_DROP_ID : listIdSet.has(overId) ? overId : null,
    [listIdSet],
  );

  // The lifted idea (for the drag overlay) — only while an idea, not a list, drags.
  const activeIdea =
    activeDrag?.type === "idea" ? (ideas.find((i) => i.id === activeDrag.id) ?? null) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Append a new idea at the end of the undated pool (date is always null here).
  const appendPositionFor = (date: string | null): string => {
    const inDate = activities
      .filter((a) => a.date === date)
      .sort((x, y) => (x.position < y.position ? -1 : x.position > y.position ? 1 : 0));
    return positionBetween(inDate.at(-1)?.position ?? null, null);
  };

  const openCreate = (defaultType: ItemType, defaultListId: string | null) =>
    setDialog({ mode: "create", defaultType, defaultListId });
  const openEdit = (activity: Activity) => setDialog({ mode: "edit", activity });
  const remove = (activity: Activity) =>
    void mutateAsync("activity.delete", { activityId: activity.id }).catch(() => {});
  const toggleChecklistItem = (activity: Activity, item: ChecklistItem, done: boolean) =>
    void mutateAsync("checklist.toggle", {
      activityId: activity.id,
      itemId: item.id,
      done,
    }).catch(() => {});

  function handleCreateList(event: FormEvent) {
    event.preventDefault();
    const name = listDraft.trim();
    if (name) void createList(name).catch(() => {});
    setListDraft("");
    setCreatingList(false);
  }

  function handleDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type === "idea" ? "idea" : "list-section";
    setActiveDrag({ id: String(event.active.id), type });
    setDropTargetKey(null);
  }

  // Track the hovered section for the highlight — only for idea drags, and never
  // the card's own list (that drop is a no-op, so it shouldn't light up).
  function handleDragOver(event: DragOverEvent) {
    if (event.active.data.current?.type !== "idea" || !event.over) {
      setDropTargetKey(null);
      return;
    }
    const key = resolveDropKey(String(event.over.id));
    const idea = ideas.find((i) => i.id === String(event.active.id));
    const currentKey = idea?.listId ?? UNLISTED_DROP_ID;
    setDropTargetKey(key === null || key === currentKey ? null : key);
  }

  // One DndContext, two interactions: branch on the dragged thing's type so a
  // card move and a list reorder never get confused (TD: data.type).
  function handleDragEnd(event: DragEndEvent) {
    const isIdea = event.active.data.current?.type === "idea";
    setActiveDrag(null);
    setDropTargetKey(null);
    if (isIdea) reassignIdea(event);
    else reorderLists(event);
  }

  function handleDragCancel() {
    setActiveDrag(null);
    setDropTargetKey(null);
  }

  // Reassign an idea to the dropped-on list (or Unlisted → null). Ideas stay
  // vote-sorted within a list, so we only change `listId` — never a position.
  function reassignIdea(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const idea = ideas.find((i) => i.id === String(active.id));
    if (!idea) return;
    const key = resolveDropKey(String(over.id));
    if (key === null) return;
    const targetListId = key === UNLISTED_DROP_ID ? null : key;
    if ((idea.listId ?? null) === targetListId) return; // dropped on its own list → no-op
    void mutateAsync("activity.update", {
      activityId: idea.id,
      patch: { listId: targetListId },
    }).catch(() => {});
  }

  // Reorder lists: drop into the new slot, then index between the new neighbors
  // (mirrors the itinerary board's activity.move via positionBetween).
  function reorderLists(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ideaLists.findIndex((l) => l.id === active.id);
    const to = ideaLists.findIndex((l) => l.id === over.id);
    if (from === -1 || to === -1) return;
    const reordered = arrayMove(ideaLists, from, to);
    const idx = reordered.findIndex((l) => l.id === active.id);
    const before = reordered[idx - 1] ?? null;
    const after = reordered[idx + 1] ?? null;
    const position = positionBetween(before?.position ?? null, after?.position ?? null);
    void reorderList(String(active.id), position).catch(() => {});
  }

  const renderFooter = (activity: Activity): ReactNode => (
    <ActivityFooter
      activityId={activity.id}
      voterIds={votesByActivity.get(activity.id) ?? []}
      comments={commentsFor(commentsByTarget, "activity", activity.id)}
      myMember={me}
      canEdit={canEdit}
      membersById={membersById}
      colors={colors}
    />
  );

  // One group's ideas as a vote-sorted list, with a per-list "Most wanted" badge
  // on the leader once it's actually pulled ahead on votes. `draggable` wires the
  // cross-list grip — set only inside the DndContext (lists/Unlisted), not the
  // flat no-lists view where there's nowhere to drag to.
  const renderIdeas = (sorted: Activity[], draggable = false): ReactNode => {
    const topVotes = sorted[0] ? (votesByActivity.get(sorted[0].id)?.length ?? 0) : 0;
    return (
      <ul className="flex flex-col gap-3">
        {sorted.map((activity, rank) => {
          const votes = votesByActivity.get(activity.id)?.length ?? 0;
          const mostWanted = rank === 0 && sorted.length > 1 && votes > 0 && votes === topVotes;
          const cardProps = {
            activity,
            canEdit,
            onEdit: openEdit,
            onDelete: remove,
            onToggleChecklistItem: toggleChecklistItem,
            footer: renderFooter(activity),
          };
          return (
            <li key={activity.id} className="relative">
              {mostWanted && (
                <span className="-top-2 absolute left-4 z-10 rounded-pill border bg-accent-strong px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-[var(--on-primary)] shadow-control">
                  Most wanted
                </span>
              )}
              {draggable && canEdit ? (
                <DraggableIdeaCard {...cardProps} />
              ) : (
                <IdeaCard {...cardProps} />
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  const emptyListHint = (
    <p className="text-sm italic text-muted-foreground">
      No ideas here yet.
      {canEdit ? " Add one with “+ Idea,” or assign an idea to this list." : ""}
    </p>
  );

  // Shown in an empty Unlisted bucket that only appears mid-drag, so the hint is
  // a drop affordance rather than idle copy.
  const unlistedDropHint = (
    <p className="text-sm italic text-muted-foreground">
      Drop an idea here to take it off its list.
    </p>
  );

  const hasContent = ideas.length > 0 || ideaLists.length > 0;
  const unlistedSorted = sortByVotes(unlisted);

  const addIdeaMenu = canEdit && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          Add idea
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => openCreate("activity", null)}>
          <MapPin aria-hidden />
          Activity
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openCreate("note", null)}>
          <StickyNote aria-hidden />
          Note
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openCreate("checklist", null)}>
          <ListChecks aria-hidden />
          Checklist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb aria-hidden className="size-5 text-[var(--accent-strong)]" />
          <h2 className="font-display text-xl font-bold">Ideas &amp; Lists</h2>
          {ideas.length > 0 && (
            <span className="text-sm font-medium text-muted-foreground">{ideas.length}</span>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreatingList(true)}
              disabled={creatingList}
            >
              <Plus aria-hidden />
              New list
            </Button>
            {addIdeaMenu}
          </div>
        )}
      </div>

      {/* Rendered outside the hasContent branch: on an empty trip the empty
          state replaces the list container, and the draft input must still
          appear or "New list" becomes a dead end. */}
      {creatingList && (
        <form className="cv-card flex items-center gap-2 p-3 sm:p-4" onSubmit={handleCreateList}>
          <Input
            autoFocus
            value={listDraft}
            maxLength={80}
            aria-label="New list name"
            placeholder="List name (e.g. Food, Day trips)"
            className="h-9"
            onChange={(e) => setListDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setListDraft("");
                setCreatingList(false);
              }
            }}
          />
          <Button type="submit" size="sm" disabled={!listDraft.trim()}>
            Add list
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setListDraft("");
              setCreatingList(false);
            }}
          >
            Cancel
          </Button>
        </form>
      )}

      {!hasContent ? (
        !creatingList && (
          <EmptyState
            icon={Lightbulb}
            title="No ideas yet"
            description="Float a place or plan the group can vote on, and group them into lists — the favorites become days on the trip."
            className="px-6 py-12"
            headingLevel={3}
          />
        )
      ) : (
        <>
          <p className="-mt-1 text-sm text-muted-foreground">
            Most-wanted first within each list. Vote freely; open an idea to drop it on a day.
          </p>

          {ideaLists.length === 0 ? (
            // No lists yet — show the pool flat (today's look), grouping optional.
            ideas.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No ideas yet.</p>
            ) : (
              renderIdeas(sortByVotes(ideas))
            )
          ) : (
            // One DndContext drives both list-section reorder and cross-list
            // idea-card moves; handlers branch on the dragged item's data.type.
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              // Always re-measure droppables so the Unlisted bucket, which only
              // mounts once an idea drag begins, is registered as a live target.
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="flex flex-col gap-4">
                <SortableContext
                  items={ideaLists.map((l) => l.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {ideaLists.map((list) => {
                    const sorted = sortByVotes(byList.get(list.id) ?? []);
                    return (
                      <SortableIdeaListSection
                        key={list.id}
                        list={list}
                        id={`list-${list.id}`}
                        name={list.name}
                        count={sorted.length}
                        canEdit={canEdit}
                        isDropTarget={activeDrag?.type === "idea" && dropTargetKey === list.id}
                        onRename={(name) => void renameList(list.id, name).catch(() => {})}
                        onDelete={() => void deleteList(list.id).catch(() => {})}
                        onAddIdea={canEdit ? () => openCreate("activity", list.id) : undefined}
                      >
                        {sorted.length === 0 ? emptyListHint : renderIdeas(sorted, true)}
                      </SortableIdeaListSection>
                    );
                  })}
                </SortableContext>

                {/* Unlisted — the home for ideas with no list (incl. those whose
                    list was just deleted). Hidden when empty, but revealed mid-drag
                    so a card always has somewhere to land to clear its list. */}
                {(unlistedSorted.length > 0 || activeDrag?.type === "idea") && (
                  <DroppableUnlistedSection
                    count={unlistedSorted.length}
                    canEdit={canEdit}
                    isDropTarget={dropTargetKey === UNLISTED_DROP_ID}
                    onAddIdea={canEdit ? () => openCreate("activity", null) : undefined}
                  >
                    {unlistedSorted.length === 0
                      ? unlistedDropHint
                      : renderIdeas(unlistedSorted, true)}
                  </DroppableUnlistedSection>
                )}
              </div>

              {/* Lifted card follows the cursor; the source dims in place. No drop
                  animation — the reassign lands via the optimistic activity.update,
                  so the default settle would snap the overlay back first. */}
              <DragOverlay dropAnimation={null}>
                {activeIdea ? (
                  <div className="cursor-grabbing">
                    <IdeaCard
                      activity={activeIdea}
                      canEdit={false}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      onToggleChecklistItem={() => {}}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}

      <ActivityFormDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        mode={dialog?.mode ?? "create"}
        activity={dialog?.mode === "edit" ? dialog.activity : undefined}
        defaultDate={dialog?.mode === "create" ? null : undefined}
        defaultType={dialog?.mode === "create" ? dialog.defaultType : undefined}
        defaultListId={dialog?.mode === "create" ? dialog.defaultListId : undefined}
        days={days}
        startDate={trip.startDate}
        currency={trip.currency}
        ideaLists={ideaLists}
        mutateAsync={mutateAsync}
        appendPositionFor={appendPositionFor}
      />
    </section>
  );
}
