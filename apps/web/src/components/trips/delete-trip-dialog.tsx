import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Destructive confirmation for deleting a trip. Controlled by the caller so
 * it can sit next to a dropdown menu (which unmounts its own items on
 * select) without losing state.
 */
export function DeleteTripDialog({
  open,
  onOpenChange,
  tripName,
  pending,
  errorMessage,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripName: string;
  pending: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      {/* Card clicks navigate — keep dialog interactions from bubbling up. */}
      <DialogContent onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Delete “{tripName}”?</DialogTitle>
          <DialogDescription>
            This permanently deletes the trip for every member — itinerary and all. There is no
            undo.
          </DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
          >
            {errorMessage}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? "Deleting…" : "Delete trip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
