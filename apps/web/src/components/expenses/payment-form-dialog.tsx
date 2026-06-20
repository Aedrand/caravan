import {
  createId,
  type MutationPayload,
  type MutationResponse,
  type MutationType,
  type TripMember,
} from "@caravan/shared";
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
import { parseMoney } from "@/lib/expenses/money";

type MutateAsync = <T extends MutationType>(
  type: T,
  payload: MutationPayload<T>,
) => Promise<MutationResponse>;

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function PaymentFormDialog({
  open,
  onOpenChange,
  members,
  currency,
  mutateAsync,
  defaultFrom,
  defaultTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: TripMember[];
  currency: string;
  mutateAsync: MutateAsync;
  defaultFrom?: string;
  defaultTo?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            A transfer between two people — it settles debts without being an expense.
          </DialogDescription>
        </DialogHeader>
        <PaymentForm
          key={open ? "open" : "closed"}
          onOpenChange={onOpenChange}
          members={members}
          currency={currency}
          mutateAsync={mutateAsync}
          defaultFrom={defaultFrom}
          defaultTo={defaultTo}
        />
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  onOpenChange,
  members,
  currency,
  mutateAsync,
  defaultFrom,
  defaultTo,
}: {
  onOpenChange: (open: boolean) => void;
  members: TripMember[];
  currency: string;
  mutateAsync: MutateAsync;
  defaultFrom?: string;
  defaultTo?: string;
}) {
  // Active members plus any ghost referenced by the defaults (settling a debt
  // owed to/from someone who left).
  const pool = members.filter(
    (m) => m.status === "active" || m.id === defaultFrom || m.id === defaultTo,
  );
  const [fromMember, setFromMember] = useState(defaultFrom ?? pool[0]?.id ?? "");
  const [toMember, setToMember] = useState(defaultTo ?? pool[1]?.id ?? pool[0]?.id ?? "");
  const [amountInput, setAmountInput] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!fromMember || !toMember) return setError("Choose both people.");
    if (fromMember === toMember) return setError("A payment needs two different people.");
    const amountMinor = parseMoney(amountInput, currency);
    if (amountMinor === null || amountMinor <= 0) return setError("Enter a valid amount.");

    setSubmitting(true);
    setError(null);
    try {
      await mutateAsync("payment.create", {
        paymentId: createId(),
        fromMember,
        toMember,
        amountMinor,
        notes,
        date: null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record that — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="grid gap-2">
          <Label htmlFor="payment-from">From</Label>
          <select
            id="payment-from"
            className={SELECT_CLASS}
            value={fromMember}
            onChange={(e) => setFromMember(e.target.value)}
          >
            {pool.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <span aria-hidden className="pb-2 text-muted-foreground">
          →
        </span>
        <div className="grid gap-2">
          <Label htmlFor="payment-to">To</Label>
          <select
            id="payment-to"
            className={SELECT_CLASS}
            value={toMember}
            onChange={(e) => setToMember(e.target.value)}
          >
            {pool.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="payment-amount">Amount ({currency})</Label>
        <Input
          id="payment-amount"
          inputMode="decimal"
          value={amountInput}
          placeholder="0.00"
          onChange={(e) => setAmountInput(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="payment-notes">Notes (optional)</Label>
        <Input
          id="payment-notes"
          value={notes}
          maxLength={2000}
          placeholder="e.g. Venmo"
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
          {submitting ? "Saving…" : "Record payment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
