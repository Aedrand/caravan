import type { IdeaList } from "@caravan/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

const NAME_MAX = 80;

/**
 * One idea-list group on the Decide / Ideas & Lists surface (D10): a collapsible
 * card with a name, idea count, a "+ Idea" affordance, a kebab (rename/delete),
 * and an optional drag handle to reorder. The same shell renders the derived
 * **Unlisted** bucket (`unlisted` — no kebab, no handle, no rename).
 *
 * Presentational: the parent computes the grouped/sorted ideas and passes the
 * rendered cards as `children`; this owns only the header chrome + collapse.
 */
export function IdeaListSection({
  name,
  count,
  canEdit,
  unlisted = false,
  dragHandle,
  onRename,
  onDelete,
  onAddIdea,
  children,
}: {
  name: string;
  count: number;
  canEdit: boolean;
  /** The derived "no list" bucket — read-only header (no rename/delete/handle). */
  unlisted?: boolean;
  /** Reorder grip, supplied by the sortable wrapper for real lists. */
  dragHandle?: ReactNode;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  /** Opens the add-idea dialog pre-targeted to this list (`defaultListId`). */
  onAddIdea?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);

  function startRename() {
    setDraft(name);
    setRenaming(true);
  }
  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename?.(trimmed);
    setRenaming(false);
  }

  return (
    <section className="cv-card overflow-hidden" aria-label={`Idea list: ${name}`}>
      <header className="flex items-center gap-1.5 px-3 py-2 sm:px-4">
        {dragHandle}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={open}
          aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
          className="shrink-0 text-muted-foreground"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
        </Button>

        {renaming ? (
          <form
            className="min-w-0 flex-1"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              commitRename();
            }}
          >
            <Input
              autoFocus
              value={draft}
              maxLength={NAME_MAX}
              aria-label="List name"
              className="h-8"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Escape") setRenaming(false);
              }}
            />
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h3 className="truncate font-display text-lg font-bold">{name}</h3>
            <span className="shrink-0 rounded-pill border bg-accent-soft px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {count}
            </span>
          </div>
        )}

        {canEdit && onAddIdea && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={onAddIdea}
          >
            <Plus aria-hidden />
            Idea
          </Button>
        )}
        {canEdit && !unlisted && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${name} list`}
                className="shrink-0 text-muted-foreground"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={startRename}>
                <Pencil aria-hidden />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete?.()}>
                <Trash2 aria-hidden />
                Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {open && <div className="flex flex-col gap-3 px-3 pt-1 pb-3 sm:px-4 sm:pb-4">{children}</div>}
    </section>
  );
}

/**
 * `IdeaListSection` made draggable for reorder (D10). Mirrors
 * `SortableActivityCard`: a dedicated grip handle so the kebab + cards inside the
 * header stay clickable, and `dropAnimation`-free reorder driven by the parent's
 * `reorderList` (fractional index). Viewers get the plain section (no handle).
 */
export function SortableIdeaListSection({
  list,
  ...props
}: {
  list: IdeaList;
  name: string;
  count: number;
  canEdit: boolean;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onAddIdea?: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    disabled: !props.canEdit,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-50" : undefined}
    >
      <IdeaListSection
        {...props}
        dragHandle={
          props.canEdit ? (
            <button
              type="button"
              aria-label={`Reorder ${props.name} list`}
              title="Drag to reorder, or focus and use the arrow keys"
              className="-ml-1 flex w-7 cursor-grab touch-none items-center justify-center self-stretch rounded text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
