import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { formatMoney } from "@/lib/money";
import { formatDateTime, MOVEMENT_LABEL, orderNo, signed } from "@/lib/format";
import { OrderActions } from "@/components/order-actions";
import { StatusBadge } from "@/components/status";
import { PageHeader } from "@/components/ui";
import { can } from "@/server/authz";
import { load, requireActor, viewerTimeZone } from "@/server/page-auth";
import { getOrder } from "@/server/services/orders";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ workspaceId: string; orderId: string }> }) {
  const { workspaceId, orderId } = await params;
  const actor = await requireActor(workspaceId, "order:read");
  const tz = await viewerTimeZone();
  const order = await load(() => getOrder(actor, orderId));
  const cancelled = order.status === "cancelled";

  const steps = [
    { label: "Placed", at: order.createdAt, note: `by ${order.createdBy.name} · stock reserved` },
    { label: "Confirmed", at: order.confirmedAt },
    cancelled ? { label: "Cancelled", at: order.cancelledAt, note: "stock restored", tone: "cancel" as const } : { label: "Completed", at: order.completedAt },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <Link href={`/w/${workspaceId}/orders`} className="hover:text-ink">
            ← Orders
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[0.8em] tracking-tighter">Order {orderNo(order.number)}</span>
            <StatusBadge status={order.status} className="align-middle text-sm" />
          </span>
        }
        description={`Created ${formatDateTime(order.createdAt, tz)} by ${order.createdBy.name}`}
        actions={can(actor.role, "order:transition") && <OrderActions workspaceId={workspaceId} orderId={order.id} status={order.status} number={order.number} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-mute">
                <tr className="[&>th]:px-5 [&>th]:py-2.5 [&>th]:font-medium">
                  <th>Item</th>
                  <th className="text-right">Unit price</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {order.items.map((i) => (
                  <tr key={i.id} className="[&>td]:px-5 [&>td]:py-3">
                    <td>
                      <Link href={`/w/${workspaceId}/products/${i.productId}`} className="font-medium hover:underline">
                        {i.productName}
                      </Link>
                      <p className="font-mono text-2xs text-ink-mute">{i.productSku}</p>
                    </td>
                    <td className="num text-right font-mono">{formatMoney(i.unitPrice)}</td>
                    <td className="num text-right font-mono">{i.quantity}</td>
                    <td className="num text-right font-mono">{formatMoney(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-end justify-between border-t border-line bg-paper px-5 py-4">
            <p className="max-w-xs text-xs text-ink-mute">Names and prices are snapshots from when the order was placed. Later catalogue edits don&apos;t change them.</p>
            <div className="text-right">
              <p className="eyebrow">Total</p>
              <p className={clsx("num mt-1 font-display text-4xl leading-none", cancelled && "text-ink-mute line-through")}>{formatMoney(order.total)}</p>
            </div>
          </div>
          {order.note && (
            <div className="border-t border-line px-5 py-4 text-sm">
              <p className="eyebrow mb-1">Note</p>
              <p className="text-ink-soft">{order.note}</p>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-sm font-medium">Timeline</h2>
            <ol className="mt-4 space-y-0">
              {steps.map((s, idx) => {
                const done = Boolean(s.at);
                return (
                  <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0">
                    {idx < steps.length - 1 && <span className={clsx("absolute left-[7px] top-4 h-full w-px", done ? "bg-ink/30" : "bg-line")} />}
                    <span
                      className={clsx(
                        "relative z-10 mt-0.5 h-[15px] w-[15px] shrink-0 rounded-full border-2",
                        !done && "border-line-strong bg-paper-raised",
                        done && s.tone === "cancel" && "border-st-cancelled bg-st-cancelled",
                        done && s.tone !== "cancel" && "border-ink bg-ink",
                      )}
                    />
                    <div className="min-w-0">
                      <p className={clsx("text-sm", done ? "font-medium" : "text-ink-faint")}>{s.label}</p>
                      <p className="font-mono text-2xs text-ink-mute">{s.at ? `${formatDateTime(s.at, tz)}${s.note ? ` · ${s.note}` : ""}` : "—"}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-medium">Stock effects</h2>
            <p className="mt-1 text-xs text-ink-mute">Ledger rows written by this order.</p>
            <ul className="mt-3 divide-y divide-line">
              {order.movements.map((m) => {
                const item = order.items.find((i) => i.productId === m.productId);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{item?.productName}</span>
                      <span className="font-mono text-2xs text-ink-mute">
                        {MOVEMENT_LABEL[m.type]} · {formatDateTime(m.createdAt, tz)}
                      </span>
                    </span>
                    <span className={`num font-mono ${m.quantityChange > 0 ? "text-st-completed" : "text-st-low"}`}>{signed(m.quantityChange)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
