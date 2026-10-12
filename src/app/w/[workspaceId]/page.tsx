import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, ShieldAlert } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { formatDateTime, MOVEMENT_LABEL, orderNo, relativeTime, signed } from "@/lib/format";
import { STATUS_LABEL, type OrderStatus } from "@/lib/order-lifecycle";
import { DateRange } from "@/components/date-range";
import { StatusBadge, StockMeter } from "@/components/status";
import { EmptyState, PageHeader } from "@/components/ui";
import { load, requireActor, viewerTimeZone } from "@/server/page-auth";
import { getDashboard } from "@/server/services/dashboard";
import { can } from "@/server/authz";

export const metadata: Metadata = { title: "Overview" };

const STATUS_ORDER: OrderStatus[] = ["pending", "confirmed", "completed", "cancelled"];
const STATUS_BAR: Record<OrderStatus, string> = { pending: "bg-st-pending", confirmed: "bg-st-confirmed", completed: "bg-st-completed", cancelled: "bg-st-cancelled/50" };

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const actor = await requireActor(workspaceId, "dashboard:read");
  const tz = await viewerTimeZone();
  const d = await load(() => getDashboard(actor, { from: sp.from, to: sp.to, tz }));
  const base = `/w/${workspaceId}`;
  const totalOrders = STATUS_ORDER.reduce((s, k) => s + d.ordersByStatus[k], 0);
  const max = Math.max(...d.series.map((p) => Number(p.value)), 1);
  const isEmpty = d.activeProducts === 0 && totalOrders === 0 && d.recentOrders.length === 0;

  return (
    <div className="space-y-8">
      {sp.denied && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-signal/30 bg-signal-soft px-3 py-2 text-sm text-signal-deep">
          <ShieldAlert className="h-4 w-4" /> That page is for workspace owners only.
        </div>
      )}
      <PageHeader
        eyebrow={`${formatDay(d.range.from)} — ${formatDay(d.range.to)} · ${tz}`}
        title="Overview"
        actions={<DateRange from={d.range.from} to={d.range.to} />}
      />

      {isEmpty ? (
        <EmptyState
          icon={<Boxes className="h-5 w-5" />}
          title="A clean slate"
          body="Add your first products, then take an order. Everything you do here shows up on this page."
          action={
            can(actor.role, "product:write") ? (
              <Link href={`${base}/products/new`} className="btn-signal">
                Add a product
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* KPI strip */}
          <section className="grid overflow-hidden rounded-lg border border-line bg-paper-raised sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
            <Kpi label="Booked value" value={formatMoney(d.bookedValue)} note="Non-cancelled orders created in range" big />
            <Kpi label="Completed value" value={formatMoney(d.completedValue)} note="Of which completed" />
            <Kpi label="Active products" value={d.activeProducts.toLocaleString()} note={`${d.outOfStock} out of stock`} href={`${base}/products`} />
            <Kpi
              label="At or below threshold"
              value={d.lowStock.toLocaleString()}
              note="Active products to reorder"
              tone={d.lowStock > 0 ? "alert" : undefined}
              href={`${base}/products?stock=low`}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="panel p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium">Booked value per day</h2>
                <span className="eyebrow">{d.series.length} days</span>
              </div>
              <div className="mt-6 flex h-40 items-end gap-[3px]" role="img" aria-label="Daily booked value bar chart">
                {d.series.map((p) => {
                  const v = Number(p.value);
                  return (
                    <div key={p.day} className="group relative flex h-full flex-1 items-end">
                      <div
                        className={v > 0 ? "w-full rounded-t-[2px] bg-ink/85 transition-colors group-hover:bg-signal" : "w-full border-t border-dashed border-line-strong"}
                        style={{ height: v > 0 ? `${Math.max(4, (v / max) * 100)}%` : 0 }}
                      />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-night px-2 py-1 font-mono text-2xs text-paper group-hover:block">
                        {formatDay(p.day)} · {formatMoney(p.value)} · {p.orders} orders
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between font-mono text-2xs text-ink-faint">
                <span>{formatDay(d.range.from)}</span>
                <span>{formatDay(d.range.to)}</span>
              </div>
            </div>

            <div className="panel p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium">Orders by status</h2>
                <span className="num font-display text-3xl leading-none">{totalOrders}</span>
              </div>
              <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-paper-sunk">
                {totalOrders > 0 &&
                  STATUS_ORDER.map((s) => (
                    <div key={s} className={STATUS_BAR[s]} style={{ width: `${(d.ordersByStatus[s] / totalOrders) * 100}%` }} title={`${STATUS_LABEL[s]}: ${d.ordersByStatus[s]}`} />
                  ))}
              </div>
              <ul className="mt-5 space-y-2.5">
                {STATUS_ORDER.map((s) => (
                  <li key={s}>
                    <Link href={`${base}/orders?status=${s}&from=${d.range.from}&to=${d.range.to}`} className="flex items-center justify-between rounded-md px-1 py-0.5 hover:bg-paper">
                      <StatusBadge status={s} />
                      <span className="num font-mono text-sm">{d.ordersByStatus[s]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-faint">Orders created in the selected range, by current status.</p>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="panel lg:col-span-2">
              <PanelHead title="Recent orders" href={`${base}/orders`} />
              {d.recentOrders.length === 0 ? (
                <p className="px-5 pb-6 text-sm text-ink-mute">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.recentOrders.map((o) => (
                    <li key={o.id}>
                      <Link href={`${base}/orders/${o.id}`} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-5 py-3 hover:bg-paper sm:grid-cols-[4.5rem_1fr_7rem_6.5rem]">
                        <span className="font-mono text-sm">{orderNo(o.number)}</span>
                        <span className="min-w-0 truncate text-sm text-ink-mute">
                          {o.createdByName} · {relativeTime(o.createdAt)}
                        </span>
                        <span className="hidden sm:block">
                          <StatusBadge status={o.status} />
                        </span>
                        <span className="num text-right font-mono text-sm">{formatMoney(o.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel">
              <PanelHead title="Needs restock" href={`${base}/products?stock=low`} />
              {d.lowStockItems.length === 0 ? (
                <p className="px-5 pb-6 text-sm text-ink-mute">Everything is above its threshold.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.lowStockItems.map((p) => (
                    <li key={p.id}>
                      <Link href={`${base}/products/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-paper">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{p.name}</span>
                          <span className="font-mono text-2xs text-ink-mute">
                            {p.sku} · min {p.lowStockThreshold}
                          </span>
                        </span>
                        <StockMeter qty={p.stockQuantity} threshold={p.lowStockThreshold} compact />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel">
            <PanelHead title="Recent stock movements" href={`${base}/inventory`} />
            {d.recentMovements.length === 0 ? (
              <p className="px-5 pb-6 text-sm text-ink-mute">No stock movements yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.recentMovements.map((m) => (
                  <li key={m.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 sm:grid-cols-[8rem_1fr_13rem_4rem_4rem]">
                    <span className="hidden font-mono text-xs text-ink-mute sm:block">{formatDateTime(m.createdAt, tz)}</span>
                    <Link href={`${base}/products/${m.productId}`} className="min-w-0 truncate text-sm hover:underline">
                      {m.productName} <span className="font-mono text-xs text-ink-mute">{m.productSku}</span>
                    </Link>
                    <span className="hidden truncate text-xs text-ink-mute sm:block">
                      {MOVEMENT_LABEL[m.type]} · {m.actorName}
                    </span>
                    <span className={`num text-right font-mono text-sm ${m.quantityChange > 0 ? "text-st-completed" : "text-st-low"}`}>{signed(m.quantityChange)}</span>
                    <span className="num hidden text-right font-mono text-xs text-ink-mute sm:block">→ {m.resultingQuantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="group rounded-lg border border-line px-5 py-4 text-sm text-ink-mute">
            <summary className="cursor-pointer list-none font-medium text-ink-soft">
              <span className="mr-2 inline-block transition group-open:rotate-90">›</span>How these numbers are counted
            </summary>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>
                <b>Booked value</b>: sum of order totals for orders created in the range with status pending, confirmed or completed. Cancelled orders are excluded.
              </li>
              <li>
                <b>Completed value</b>: the same, completed orders only.
              </li>
              <li>
                <b>Orders by status</b>: orders created in the range, grouped by their current status.
              </li>
              <li>
                <b>Active products</b> and <b>at or below threshold</b> are live counts, independent of the range. Low stock means an active product with stock ≤ its low-stock threshold.
              </li>
              <li>The range is calendar days in your time zone ({tz}), both ends inclusive.</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

function formatDay(day: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

function Kpi({ label, value, note, big, tone, href }: { label: string; value: string; note: string; big?: boolean; tone?: "alert"; href?: string }) {
  const body = (
    <>
      <p className="eyebrow flex items-center gap-1.5">
        {tone === "alert" && <span className="h-1.5 w-1.5 rounded-full bg-signal" />}
        {label}
      </p>
      <p className={`num mt-3 font-display leading-none tracking-tight ${big ? "text-[2.75rem]" : "text-[2.4rem]"} ${tone === "alert" ? "text-signal-deep" : ""}`}>{value}</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-ink-mute">
        {note}
        {href && <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />}
      </p>
    </>
  );
  const cls = "group block border-line p-5 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:[&:not(:last-child)]:border-r";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-paper`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function PanelHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between px-5 pb-3 pt-4">
      <h2 className="text-sm font-medium">{title}</h2>
      <Link href={href} className="text-xs text-ink-mute hover:text-ink">
        View all →
      </Link>
    </div>
  );
}
