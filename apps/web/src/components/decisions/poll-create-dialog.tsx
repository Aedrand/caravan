import { createId, POLL_OPTION_MAX, POLL_QUESTION_MAX } from "@caravan/shared";
import { Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTripMutation } from "@/lib/sync";

/** Create-poll form (A.2 / PD-3): question + ≥2 options, with the multi-select
 *  and member-added-options flags. Remounted per open so fields reset. */
export function PollCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New poll</DialogTitle>
          <DialogDescription>
            Ask the group an open question — everyone votes, and you can turn the winner into an
            idea later.
          </DialogDescription>
        </DialogHeader>
        {open && <PollForm key="new" onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

type DraftOption = { key: string; label: string };

function PollForm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { mutateAsync } = useTripMutation();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<DraftOption[]>([
    { key: createId(), label: "" },
    { key: createId(), label: "" },
  ]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [allowMemberOptions, setAllowMemberOptions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setOption = (key: string, label: string) =>
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, label } : o)));
  const addOption = () =>
    setOptions((prev) => (prev.length >= 20 ? prev : [...prev, { key: createId(), label: "" }]));
  const removeOption = (key: string) =>
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((o) => o.key !== key)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    const filled = options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label);
    if (!q) return setError("Add a question.");
    if (filled.length < 2) return setError("Add at least two options.");

    void mutateAsync("poll.create", {
      pollId: createId(),
      question: q,
      multiSelect,
      allowMemberOptions,
      closesAt: null,
      options: filled.map((o) => ({ optionId: o.key, label: o.label })),
    })
      .then(() => onOpenChange(false))
      .catch(() => setError("Couldn't create the poll. Try again."));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="poll-question">Question</Label>
        <Input
          id="poll-question"
          autoFocus
          value={question}
          maxLength={POLL_QUESTION_MAX}
          placeholder="Which week works?"
          onChange={(e) => setQuestion(e.target.value)}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Options</legend>
        {options.map((option, i) => (
          <div key={option.key} className="flex items-center gap-2">
            <Input
              value={option.label}
              maxLength={POLL_OPTION_MAX}
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1}`}
              onChange={(e) => setOption(option.key, e.target.value)}
            />
            {options.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove option ${i + 1}`}
                className="shrink-0 text-muted-foreground"
                onClick={() => removeOption(option.key)}
              >
                <X aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {options.length < 20 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={addOption}
          >
            <Plus aria-hidden />
            Add option
          </Button>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={multiSelect}
            onChange={(e) => setMultiSelect(e.target.checked)}
          />
          Allow choosing more than one
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowMemberOptions}
            onChange={(e) => setAllowMemberOptions(e.target.checked)}
          />
          Let anyone add options
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit">Create poll</Button>
      </DialogFooter>
    </form>
  );
}
