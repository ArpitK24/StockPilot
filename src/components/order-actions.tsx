"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { allowedActions, type OrderAction, type OrderStatus } from "@/lib/order-lifecycle";
import { api, ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

const COPY: Record<OrderAction, { label: string; title: string; body: string; done: string }> = {
  confirm: { label: "Confirm order", title: "Confirm this order?", body: "Stock is already reserved; confirming doesn't change it.", done: "Order confirmed" },
  complete: { label: "Mark completed", title: "Mark as completed?", body: "The reserved stock becomes final. Completed orders can't be cancelled.", done: "Order completed" },
  cancel: { label: "Cancel order", title: "Cancel this order?", body: "All reserved stock goes back on the shelf. This can't be undone.", done: "Order cancelled, stock restored" },
};

export function OrderActions({ workspaceId, orderId, status, number }: { workspaceId: string; orderId: string; status: OrderStatus; number: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<OrderAction | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = allowedActions(status);
  if (actions.length === 0) return <p className="text-sm text-ink-mute">This order is {status}. No further changes are possible.</p>;

  async function run(action: OrderAction) {
    setBusy(true);
    try {
      await api(`/api/workspaces/${workspaceId}/orders/${orderId}/transitions`, { method: "POST", body: { action } });
      toast({ kind: "success", title: COPY[action].done, body: `Order #${number}` });
    } catch (err) {
      toast({ kind: "error", title: "Couldn't update the order", body: err instanceof ApiError ? err.message : undefined });
    } finally {
      setBusy(false);
      setPending(null);
      router.refresh();
    }
  }

  const primary = actions.filter((a) => a !== "cancel");
  return (
    <div className="flex flex-wrap gap-2">
      {primary.map((a) => (
        <button key={a} type="button" className="btn-primary" disabled={busy} onClick={() => setPending(a)}>
          {COPY[a].label}
        </button>
      ))}
      {actions.includes("cancel") && (
        <button type="button" className="btn-outline text-st-out hover:border-st-out" disabled={busy} onClick={() => setPending("cancel")}>
          Cancel order
        </button>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={pending ? COPY[pending].title : ""}
        confirmLabel={pending ? COPY[pending].label : ""}
        tone={pending === "cancel" ? "danger" : "default"}
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={() => pending && run(pending)}
      >
        {pending && COPY[pending].body}
      </ConfirmDialog>
    </div>
  );
}
