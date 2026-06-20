import {
  computeBalances,
  type Expense,
  type Payment,
  settleBalances,
  type TripMember,
} from "@caravan/shared";
import { ArrowRight, Pencil, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/expenses/money";
import { useMoney } from "@/lib/expenses/use-money";
import { FALLBACK_PERSON_COLOR, personColors } from "@/lib/person-colors";
import { useMyMember, useTripMutation } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORY_META } from "./categories";
import { ExpenseFormDialog } from "./expense-form-dialog";
import { PaymentFormDialog } from "./payment-form-dialog";
import { categoryTotals, totalSpend } from "./summary";

/**
 * The Expenses panel (Track B.4): one stacked `<section>` on the trip page —
 * expense + payment list, settlement summary ("who pays whom"), per-person
 * totals, per-category totals, and a budget overview. Settlement is computed
 * client-side from the money query (never stored). Single trip currency (PD-8).
 */
export function ExpensesPanel({
  tripId,
  members,
  currency,
  canEdit,
}: {
  tripId: string;
  members: TripMember[];
  currency: string;
  canEdit: boolean;
}) {
  const moneyQuery = useMoney(tripId);
  const { mutateAsync } = useTripMutation();
  const me = useMyMember();

  const [expenseDialog, setExpenseDialog] = useState<{
    mode: "create" | "edit";
    expense?: Expense;
  } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const expenses = moneyQuery.data?.expenses ?? [];
  const payments = moneyQuery.data?.payments ?? [];

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nameOf = (memberId: string) => memberById.get(memberId)?.name ?? "Someone";
  const colors = useMemo(
    () => personColors([...members].sort((a, b) => a.joinedAt - b.joinedAt)),
    [members],
  );
  const colorOf = (memberId: string) => colors.get(memberId) ?? FALLBACK_PERSON_COLOR;

  // Settlement + balances over ALL members (active + ghost) so debts persist.
  const allMemberIds = useMemo(() => members.map((m) => m.id), [members]);
  const balances = useMemo(
    () => computeBalances(expenses, payments, allMemberIds),
    [expenses, payments, allMemberIds],
  );
  const transfers = useMemo(() => settleBalances(balances), [balances]);
  const catTotals = useMemo(() => categoryTotals(expenses), [expenses]);
  const spend = totalSpend(expenses);

  const hasMoney = expenses.length > 0 || payments.length > 0;

  function canModify(createdBy: string): boolean {
    if (!canEdit || !me) return false;
    return me.id === createdBy || me.role === "owner";
  }

  async function deleteExpense(expense: Expense) {
    await mutateAsync("expense.delete", { expenseId: expense.id }).catch(() => {});
  }
  async function deletePayment(payment: Payment) {
    await mutateAsync("payment.delete", { paymentId: payment.id }).catch(() => {});
  }

  return (
    <section className="cv-card flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Wallet aria-hidden className="size-5 text-muted-foreground" />
          Expenses
        </h2>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)}>
              <ArrowRight aria-hidden />
              Record payment
            </Button>
            <Button size="sm" onClick={() => setExpenseDialog({ mode: "create" })}>
              <Plus aria-hidden />
              Add expense
            </Button>
          </div>
        )}
      </header>

      {moneyQuery.isPending ? (
        <div className="h-24 animate-pulse rounded-card bg-muted/60" />
      ) : !hasMoney ? (
        <p className="py-4 text-sm text-muted-foreground">
          No expenses yet. Log what the group spends and Caravan keeps the running tally — and tells
          everyone who owes whom.
        </p>
      ) : (
        <div className="grid gap-5">
          {/* Budget overview */}
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold">{formatMoney(spend, currency)}</span>
            <span className="text-sm text-muted-foreground">
              spent across {expenses.length} expense{expenses.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Settlement: who pays whom */}
          <SettlementSummary
            transfers={transfers}
            currency={currency}
            nameOf={nameOf}
            colorOf={colorOf}
          />

          {/* Per-person totals */}
          <div>
            <h3 className="mb-2 font-display text-sm font-bold">Per person</h3>
            <ul className="grid gap-1.5">
              {balances
                .filter((b) => memberById.has(b.memberId))
                .filter((b) => b.paidMinor > 0 || b.owedMinor > 0 || b.paymentsMinor !== 0)
                .sort((a, b) => b.netMinor - a.netMinor)
                .map((b) => {
                  const m = memberById.get(b.memberId);
                  return (
                    <li key={b.memberId} className="flex items-center gap-2 text-sm">
                      <Avatar name={m?.name ?? "?"} color={colorOf(b.memberId)} />
                      <span className="min-w-0 flex-1 truncate">
                        {m?.name ?? "Someone"}
                        {m?.status === "ghost" ? " (left)" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        paid {formatMoney(b.paidMinor, currency)} · owes{" "}
                        {formatMoney(b.owedMinor, currency)}
                      </span>
                      <NetPill netMinor={b.netMinor} currency={currency} />
                    </li>
                  );
                })}
            </ul>
          </div>

          {/* Per-category totals */}
          {catTotals.length > 0 && (
            <div>
              <h3 className="mb-2 font-display text-sm font-bold">By category</h3>
              <ul className="flex flex-wrap gap-2">
                {catTotals.map(({ category, totalMinor }) => {
                  const meta = EXPENSE_CATEGORY_META[category];
                  return (
                    <li
                      key={category}
                      className="flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: meta.soft, color: meta.color }}
                    >
                      <meta.Icon aria-hidden className="size-3.5" />
                      {meta.label}
                      <span className="font-semibold">{formatMoney(totalMinor, currency)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Expense + payment list */}
          <div>
            <h3 className="mb-2 font-display text-sm font-bold">Activity</h3>
            <ul className="cv-divider flex flex-col">
              {expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  currency={currency}
                  payerName={nameOf(expense.paidBy)}
                  payerColor={colorOf(expense.paidBy)}
                  canModify={canModify(expense.createdBy)}
                  onEdit={() => setExpenseDialog({ mode: "edit", expense })}
                  onDelete={() => deleteExpense(expense)}
                />
              ))}
              {payments.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  currency={currency}
                  fromName={nameOf(payment.fromMember)}
                  toName={nameOf(payment.toMember)}
                  canModify={canModify(payment.createdBy)}
                  onDelete={() => deletePayment(payment)}
                />
              ))}
            </ul>
          </div>
        </div>
      )}

      {expenseDialog && (
        <ExpenseFormDialog
          open
          onOpenChange={(open) => !open && setExpenseDialog(null)}
          mode={expenseDialog.mode}
          expense={expenseDialog.expense}
          members={members}
          currency={currency}
          mutateAsync={mutateAsync}
        />
      )}
      <PaymentFormDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        members={members}
        currency={currency}
        mutateAsync={mutateAsync}
      />
    </section>
  );
}

function SettlementSummary({
  transfers,
  currency,
  nameOf,
  colorOf,
}: {
  transfers: { fromMember: string; toMember: string; amountMinor: number }[];
  currency: string;
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
}) {
  return (
    <div className="rounded-card bg-muted/40 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold">
        <Receipt aria-hidden className="size-4 text-muted-foreground" />
        Settle up
      </h3>
      {transfers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everyone's square — no payments needed.</p>
      ) : (
        <ul className="grid gap-1.5">
          {transfers.map((t) => (
            <li
              key={`${t.fromMember}-${t.toMember}`}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <Avatar name={nameOf(t.fromMember)} color={colorOf(t.fromMember)} />
              <span className="font-medium">{nameOf(t.fromMember)}</span>
              <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
              <Avatar name={nameOf(t.toMember)} color={colorOf(t.toMember)} />
              <span className="font-medium">{nameOf(t.toMember)}</span>
              <span className="ml-auto font-semibold">{formatMoney(t.amountMinor, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExpenseRow({
  expense,
  currency,
  payerName,
  payerColor,
  canModify,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  currency: string;
  payerName: string;
  payerColor: string;
  canModify: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = EXPENSE_CATEGORY_META[expense.category];
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: meta.soft, color: meta.color }}
      >
        <meta.Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{expense.description}</p>
        <p className="text-xs text-muted-foreground">
          <span style={{ color: payerColor }} className="font-medium">
            {payerName}
          </span>{" "}
          paid · split {expense.shares.length} way{expense.shares.length === 1 ? "" : "s"}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold">
        {formatMoney(expense.amountMinor, currency)}
      </span>
      {canModify && <RowMenu onEdit={onEdit} onDelete={onDelete} noun="expense" />}
    </li>
  );
}

function PaymentRow({
  payment,
  currency,
  fromName,
  toName,
  canModify,
  onDelete,
}: {
  payment: Payment;
  currency: string;
  fromName: string;
  toName: string;
  canModify: boolean;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]"
      >
        <ArrowRight className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {fromName} paid {toName}
        </p>
        <p className="text-xs text-muted-foreground">
          Payment{payment.notes ? ` · ${payment.notes}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold">
        {formatMoney(payment.amountMinor, currency)}
      </span>
      {canModify && <RowMenu onDelete={onDelete} noun="payment" />}
    </li>
  );
}

function RowMenu({
  onEdit,
  onDelete,
  noun,
}: {
  onEdit?: () => void;
  onDelete: () => void;
  noun: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${noun} actions`}
          className="shrink-0 text-muted-foreground"
        >
          <Pencil aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-semibold uppercase text-white"
      style={{ backgroundColor: color }}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

function NetPill({ netMinor, currency }: { netMinor: number; currency: string }) {
  if (netMinor === 0) {
    return (
      <span className="rounded-pill bg-muted px-2 py-0.5 text-xs text-muted-foreground">even</span>
    );
  }
  const owed = netMinor > 0;
  return (
    <span
      className={cn(
        "rounded-pill px-2 py-0.5 text-xs font-semibold",
        owed
          ? "bg-[var(--success-soft)] text-[var(--success)]"
          : "bg-[var(--danger-soft)] text-[var(--danger)]",
      )}
    >
      {owed ? "+" : "−"}
      {formatMoney(Math.abs(netMinor), currency)}
    </span>
  );
}
