import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { formatDateTime, orderNo } from "@/lib/format";
import { DateRange } from "@/components/date-range";
import { SearchInput, Segmented } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status";
import { EmptyState, PageHeader, Pagination, withParams } from "@/components/ui";
import { can } from "@/server/authz";
import { AppError } from "@/server/errors";
import { load, requireActor, viewerTimeZone } from "@/server/page-auth";
import { listOrders } from "@/server/services/orders";
import { searchParamsToObject } from "@/server/validation/common";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { workspaceId } = await params;
  const sp = searchParamsToObject(await searchParams);
  const actor = await requireActor(workspaceId, "order:read");
  const tz = await viewerTimeZone();
  let filterError: string | undefined;
  const result = await load(() =>
    listOrders(actor, { ...sp, tz }).catch((err) => {
      if (err instanceof AppError && err.code === "VALIDATION_ERROR") {
        filterError = Object.values(err.fields ?? {})[0] ?? err.message;
        return listOrders(actor, { tz });
      }
      throw err;
    }),
  );
  const base = `/w/${workspaceId}/orders`;
  const filtered = Boolean(sp.q || sp.status || sp.from || sp.to);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Orders"
        description="Creating an order reserves its stock immediately. Cancelling a pending or confirmed order gives it back."
        actions={
          can(actor.role, "order:create") && (
            <Link href={`${base}/new`} className="btn-signal">
              <Plus className="h-4 w-4" /> New order
            </Link>
          )
        }
      />
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput placeholder="Order number, e.g. 1042" />
          <Segmented
            name="status"
            value={sp.status ?? ""}
            options={[
              { value: "", label: "All" },
              { value: "pending", label: "Pending" },
              { value: "confirmed", label: "Confirmed" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </div>
        <DateRange from={sp.from} to={sp.to} allowClear />
      </div>
      {filterError && <p className="text-sm text-st-out">{filterError}</p>}

      {result.items.length === 0 ? (
        filtered ? (
          <EmptyState title="No matching orders" body="Try another status or date range." action={<Link href={base} className="btn-outline">Clear filters</Link>} />
        ) : (
          <EmptyState
            icon={<ReceiptText className="h-5 w-5" />}
            title="No orders yet"
            body="Build an order from your active products. Stock is reserved the moment you place it."
            action={can(actor.role, "order:create") && <Link href={`${base}/new`} className="btn-signal">Create an order</Link>}
          />
        )
      ) : (
        <div>
          <div className="overflow-x-auto rounded-lg border border-line bg-paper-raised">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-mute">
                <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
                  <th>Order</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-right">Lines</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.items.map((o) => (
                  <tr key={o.id} className={`relative hover:bg-paper [&>td]:px-4 [&>td]:py-3 ${o.status === "cancelled" ? "text-ink-mute" : ""}`}>
                    <td>
                      <Link href={`${base}/${o.id}`} className="font-mono font-medium after:absolute after:inset-0">
                        {orderNo(o.number)}
                      </Link>
                      <p className="text-xs text-ink-mute">by {o.createdByName}</p>
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs text-ink-mute">{formatDateTime(o.createdAt, tz)}</td>
                    <td className="num text-right font-mono text-xs text-ink-soft">
                      {o.lines ?? 0} · {o.units ?? 0} units
                    </td>
                    <td className={`num text-right font-mono ${o.status === "cancelled" ? "line-through" : ""}`}>{formatMoney(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} noun="orders" hrefFor={(n) => withParams(base, sp, { page: n })} />
        </div>
      )}
    </div>
  );
}
