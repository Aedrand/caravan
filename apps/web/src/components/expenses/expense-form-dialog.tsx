import {
  createId,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type MutationPayload,
  type MutationResponse,
  type MutationType,
  resolveSplit,
  SplitError,
  type SplitSpec,
  type TripMember,
} from "@caravan/shared";
import { type FormEvent, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, minorToInput, parseMoney } from "@/lib/expenses/money";
import { EXPENSE_CATEGORY_META } from "./categories";

type MutateAsync = <T extends MutationType>(
  type: T,
  payload: MutationPayload<T>,
) => Promise<MutationResponse>;

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ExpenseFormDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  expense?: Expense;
  members: TripMember[];
  currency: string;
  mutateAsync: MutateAsync;
}) {
  const { open, onOpenChange, mode, expense } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add an expense" : "Edit expense"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Log what was spent and split it among the group."
              : "Update the amount, split, or details — balances recompute for everyone."}
          </DialogDescription>
        </DialogHeader>
        <ExpenseForm key={`${mode}:${expense?.id ?? "new"}`} {...props} />
      </DialogContent>
    </Dialog>
  );
}

/** Members who can participate: active members, plus any ghost already on this expense. */
function participantPool(members: TripMember[], expense?: Expense): TripMember[] {
  const onExpense = new Set(expense?.shares.map((s) => s.memberId) ?? []);
  return members.filter((m) => m.status === "active" || onExpense.has(m.id));
}

function ExpenseForm({
  onOpenChange,
  mode,
  expense,
  members,
  currency,
  mutateAsync,
}: {
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  expense?: Expense;
  members: TripMember[];
  currency: string;
  mutateAsync: MutateAsync;
}) {
  const pool = useMemo(() => participantPool(members, expense), [members, expense]);
  const payers = pool;

  const [description, setDescription] = useState(expense?.description ?? "");
  const [amountInput, setAmountInput] = useState(
    expense ? minorToInput(expense.amountMinor, currency) : "",
  );
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "other");
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? pool[0]?.id ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [dateValue, setDateValue] = useState(expense?.date ?? "");

  const [splitKind, setSplitKind] = useState<"equal" | "exact">(
    // An edit with uneven shares opens in exact mode.
    expense && !sharesLookEqual(expense) ? "exact" : "equal",
  );
  // Members included in an EQUAL split (default: everyone in the pool).
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(expense ? expense.shares.map((s) => s.memberId) : pool.map((m) => m.id)),
  );
  // Per-member exact amounts (major-unit strings), for the exact mode.
  const [exactInputs, setExactInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const s of expense?.shares ?? []) map[s.memberId] = minorToInput(s.amountMinor, currency);
    return map;
  });

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const amountMinor = parseMoney(amountInput, currency);

  function toggleIncluded(memberId: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  // Live preview of the exact-split total so the user sees it reconcile.
  const exactTotalMinor = useMemo(() => {
    return pool.reduce((sum, m) => sum + (parseMoney(exactInputs[m.id] ?? "", currency) ?? 0), 0);
  }, [pool, exactInputs, currency]);

  function buildSplit(): SplitSpec | { error: string } {
    if (splitKind === "equal") {
      const memberIds = pool.filter((m) => included.has(m.id)).map((m) => m.id);
      if (memberIds.length === 0) return { error: "Pick at least one person to split with." };
      return { kind: "equal", memberIds };
    }
    const shares = pool
      .map((m) => ({ memberId: m.id, amountMinor: parseMoney(exactInputs[m.id] ?? "", currency) }))
      .filter((s): s is { memberId: string; amountMinor: number } => s.amountMinor !== null)
      .filter((s) => s.amountMinor > 0);
    if (shares.length === 0) return { error: "Enter at least one custom amount." };
    return { kind: "exact", shares };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) return setError("Give the expense a description.");
    if (amountMinor === null || amountMinor <= 0) return setError("Enter a valid amount.");
    if (!paidBy) return setError("Choose who paid.");

    const split = buildSplit();
    if ("error" in split) return setError(split.error);

    // Validate the split sums to the total before sending (server re-checks).
    try {
      resolveSplit(amountMinor, split);
    } catch (err) {
      if (err instanceof SplitError) {
        return setError(
          err.code === "exact_mismatch"
            ? `Custom amounts must add up to ${formatMoney(amountMinor, currency)}.`
            : err.message,
        );
      }
      throw err;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (mode === "create") {
        await mutateAsync("expense.create", {
          expenseId: createId(),
          paidBy,
          amountMinor,
          description: trimmed,
          category,
          notes,
          date: dateValue || null,
          activityId: null,
          split,
        });
      } else if (expense) {
        const patch: MutationPayload<"expense.update">["patch"] = {};
        if (trimmed !== expense.description) patch.description = trimmed;
        if (amountMinor !== expense.amountMinor) patch.amountMinor = amountMinor;
        if (category !== expense.category) patch.category = category;
        if (paidBy !== expense.paidBy) patch.paidBy = paidBy;
        if (notes !== expense.notes) patch.notes = notes;
        if ((dateValue || null) !== expense.date) patch.date = dateValue || null;
        // Always resend the split on edit — amount or membership may have moved,
        // and shares must always reconcile to the (possibly new) total.
        patch.split = split;
        await mutateAsync("expense.update", { expenseId: expense.id, patch });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="expense-desc">Description</Label>
        <Input
          id="expense-desc"
          autoFocus
          value={description}
          maxLength={200}
          placeholder="Dinner at the trattoria"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="expense-amount">Amount ({currency})</Label>
          <Input
            id="expense-amount"
            inputMode="decimal"
            value={amountInput}
            placeholder="0.00"
            onChange={(e) => setAmountInput(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="expense-category">Category</Label>
          <select
            id="expense-category"
            className={SELECT_CLASS}
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="expense-paidby">Paid by</Label>
          <select
            id="expense-paidby"
            className={SELECT_CLASS}
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
          >
            {payers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.status === "ghost" ? " (left)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="expense-date">Date (optional)</Label>
          <Input
            id="expense-date"
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="grid gap-3 rounded-card border border-[var(--ink-faint)] p-3">
        <div className="flex items-center justify-between">
          <legend className="font-display text-sm font-bold">Split</legend>
          <div className="flex gap-1" role="tablist" aria-label="Split mode">
            <SplitTab active={splitKind === "equal"} onClick={() => setSplitKind("equal")}>
              Equal
            </SplitTab>
            <SplitTab active={splitKind === "exact"} onClick={() => setSplitKind("exact")}>
              Custom
            </SplitTab>
          </div>
        </div>

        {splitKind === "equal" ? (
          <ul className="grid gap-1.5">
            {pool.map((m) => (
              <li key={m.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={included.has(m.id)}
                    onChange={() => toggleIncluded(m.id)}
                  />
                  <span>
                    {m.name}
                    {m.status === "ghost" ? " (left)" : ""}
                  </span>
                  {amountMinor !== null && included.has(m.id) && included.size > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatMoney(Math.floor(amountMinor / included.size), currency)} ea
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-2">
            <ul className="grid gap-1.5">
              {pool.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">
                    {m.name}
                    {m.status === "ghost" ? " (left)" : ""}
                  </span>
                  <Input
                    inputMode="decimal"
                    aria-label={`${m.name}'s share`}
                    className="h-8 w-28"
                    placeholder="0.00"
                    value={exactInputs[m.id] ?? ""}
                    onChange={(e) =>
                      setExactInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                  />
                </li>
              ))}
            </ul>
            {amountMinor !== null && (
              <p
                className={
                  exactTotalMinor === amountMinor
                    ? "text-xs text-muted-foreground"
                    : "text-xs text-destructive"
                }
              >
                Allocated {formatMoney(exactTotalMinor, currency)} of{" "}
                {formatMoney(amountMinor, currency)}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="expense-notes">Notes</Label>
        <Textarea
          id="expense-notes"
          value={notes}
          maxLength={2000}
          placeholder="Anything worth remembering"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : mode === "create" ? "Add expense" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SplitTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "rounded-pill bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
          : "rounded-pill px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
      }
    >
      {children}
    </button>
  );
}

/** Heuristic: do the shares look like a clean equal split? (drives default mode) */
function sharesLookEqual(expense: Expense): boolean {
  const amounts = expense.shares.map((s) => s.amountMinor);
  if (amounts.length === 0) return true;
  return Math.max(...amounts) - Math.min(...amounts) <= 1;
}
