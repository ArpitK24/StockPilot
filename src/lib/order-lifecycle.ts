/** Shared by server (enforcement) and UI (which buttons to show). */
export type OrderStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type OrderAction = "confirm" | "complete" | "cancel";

export const ORDER_TRANSITIONS: Record<OrderAction, { from: readonly OrderStatus[]; to: OrderStatus }> = {
  confirm: { from: ["pending"], to: "confirmed" },
  complete: { from: ["confirmed"], to: "completed" },
  cancel: { from: ["pending", "confirmed"], to: "cancelled" },
};

export function allowedActions(status: OrderStatus): OrderAction[] {
  return (Object.keys(ORDER_TRANSITIONS) as OrderAction[]).filter((a) => ORDER_TRANSITIONS[a].from.includes(status));
}

export function canTransition(status: OrderStatus, action: OrderAction): boolean {
  return ORDER_TRANSITIONS[action].from.includes(status);
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};
