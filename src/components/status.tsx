import clsx from "clsx";
import { STATUS_LABEL, type OrderStatus } from "@/lib/order-lifecycle";

/** Each status has its own glyph *and* colour, so it reads without relying on colour alone. */
const STYLE: Record<OrderStatus, { cls: string; glyph: React.ReactNode }> = {
  pending: {
    cls: "text-st-pending bg-[#FBF1DE] ring-[#EBD3A4]",
    glyph: <span className="h-2 w-2 rounded-full border-[1.5px] border-current" />,
  },
  confirmed: {
    cls: "text-st-confirmed bg-[#E8EDFF] ring-[#C5D1FF]",
    glyph: <span className="h-2 w-2 rounded-full border-[1.5px] border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]" />,
  },
  completed: { cls: "text-st-completed bg-[#E3F4EA] ring-[#B9E2C9]", glyph: <span className="h-2 w-2 rounded-full bg-current" /> },
  cancelled: {
    cls: "text-st-cancelled bg-paper-sunk ring-line-strong line-through decoration-1",
    glyph: <span className="relative h-2 w-2 rounded-full border-[1.5px] border-current after:absolute after:left-1/2 after:top-[-2px] after:h-[10px] after:w-[1.5px] after:-translate-x-1/2 after:rotate-45 after:bg-current" />,
  },
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const s = STYLE[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", s.cls, className)}>
      {s.glyph}
      {STATUS_LABEL[status]}
    </span>
  );
}

export type StockLevel = "out" | "low" | "ok";
export const stockLevel = (qty: number, threshold: number): StockLevel => (qty === 0 ? "out" : qty <= threshold ? "low" : "ok");

/** Quantity with a meter scaled to 3x the threshold, so "how close to reorder" is visible at a glance. */
export function StockMeter({ qty, threshold, compact }: { qty: number; threshold: number; compact?: boolean }) {
  const level = stockLevel(qty, threshold);
  const cap = Math.max(threshold * 3, 1);
  const pct = Math.min(100, (qty / cap) * 100);
  const mark = Math.min(100, (threshold / cap) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className={clsx("num w-12 text-right font-mono text-sm", level === "out" && "text-st-out", level === "low" && "text-st-low font-semibold")}>{qty}</span>
      {!compact && (
        <span className="relative hidden h-1.5 w-20 overflow-hidden rounded-full bg-paper-sunk sm:block" aria-hidden>
          <span
            className={clsx("absolute inset-y-0 left-0 rounded-full", level === "ok" ? "bg-ink/70" : level === "low" ? "bg-st-low" : "bg-st-out")}
            style={{ width: `${pct}%` }}
          />
          <span className="absolute inset-y-[-2px] w-px bg-ink/40" style={{ left: `${mark}%` }} />
        </span>
      )}
      {level !== "ok" && (
        <span className={clsx("rounded px-1.5 py-px font-mono text-2xs uppercase tracking-wider", level === "out" ? "bg-[#FDE8E7] text-st-out" : "bg-signal-soft text-st-low")}>
          {level === "out" ? "Out" : "Low"}
        </span>
      )}
    </div>
  );
}
