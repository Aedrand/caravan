import { COMMENT_MAX_LENGTH, type Comment, createId, type TripMember } from "@caravan/shared";
import { Check, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FALLBACK_PERSON_COLOR } from "@/lib/person-colors";
import { relativeTime } from "@/lib/relative-time";
import { useTripMutation } from "@/lib/sync";
import { Linkify } from "./linkify";

/**
 * A flat comment stream (A.4 / PD-4) on an activity or a poll. Author may edit
 * or delete; the trip owner may also delete (the server enforces both). Plain
 * text, linkified at render. No threading or reactions in v1.
 */
export function CommentThread({
  targetType,
  targetId,
  comments,
  membersById,
  colors,
  myMember,
  canComment,
}: {
  targetType: "activity" | "poll";
  targetId: string;
  comments: Comment[];
  membersById: Map<string, TripMember>;
  colors: Map<string, string>;
  myMember: TripMember | null;
  canComment: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              author={membersById.get(comment.authorId)}
              color={colors.get(comment.authorId) ?? FALLBACK_PERSON_COLOR}
              myMember={myMember}
            />
          ))}
        </ul>
      )}
      {canComment ? (
        <CommentComposer targetType={targetType} targetId={targetId} />
      ) : (
        comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  author,
  color,
  myMember,
}: {
  comment: Comment;
  author: TripMember | undefined;
  color: string;
  myMember: TripMember | null;
}) {
  const { mutateAsync } = useTripMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  const isAuthor = myMember?.id === comment.authorId;
  const isOwner = myMember?.role === "owner";
  const canEdit = isAuthor;
  const canDelete = isAuthor || isOwner;
  const name = author?.name ?? "Someone";

  const save = (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || body === comment.body) {
      setEditing(false);
      return;
    }
    void mutateAsync("comment.update", { commentId: comment.id, body }).catch(() => {});
    setEditing(false);
  };

  const remove = () =>
    void mutateAsync("comment.delete", { commentId: comment.id }).catch(() => {});

  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex size-6 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-semibold uppercase text-white"
        style={{ backgroundColor: color }}
      >
        {name.trim().charAt(0) || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm leading-tight">
          <span className="font-semibold">{name}</span>
          <span className="text-xs text-muted-foreground">{relativeTime(comment.createdAt)}</span>
          {comment.editedAt && <span className="text-xs text-muted-foreground">· edited</span>}
        </p>
        {editing ? (
          <form onSubmit={save} className="mt-1 flex flex-col gap-2">
            <Textarea
              autoFocus
              value={draft}
              maxLength={COMMENT_MAX_LENGTH}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edit comment"
            />
            <div className="flex gap-2">
              <Button type="submit" size="xs">
                <Check aria-hidden />
                Save
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(false);
                }}
              >
                <X aria-hidden />
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            <Linkify text={comment.body} />
          </p>
        )}
        {!editing && (canEdit || canDelete) && (
          <div className="mt-1 flex gap-1">
            {canEdit && (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Edit comment"
                className="text-muted-foreground"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden />
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Delete comment"
                className="text-muted-foreground"
                onClick={remove}
              >
                <Trash2 aria-hidden />
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function CommentComposer({
  targetType,
  targetId,
}: {
  targetType: "activity" | "poll";
  targetId: string;
}) {
  const { mutateAsync } = useTripMutation();
  const [body, setBody] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    void mutateAsync("comment.create", {
      commentId: createId(),
      targetType,
      targetId,
      body: trimmed,
    }).catch(() => {});
    setBody("");
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <Textarea
        value={body}
        maxLength={COMMENT_MAX_LENGTH}
        rows={1}
        placeholder="Add a comment — reasons help the group decide"
        aria-label="Add a comment"
        className="min-h-9 resize-none"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
      />
      <Button type="submit" size="sm" disabled={!body.trim()}>
        <MessageSquare aria-hidden />
        Post
      </Button>
    </form>
  );
}
