import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { DateRange } from "@/components/date-range";
import { SelectFilter } from "@/components/filter-bar";
import { MovementsTable } from "@/components/movements-table";
import { EmptyState, PageHeader, Pagination, withParams } from "@/components/ui";
import { AppError } from "@/server/errors";
import { load, requireActor, viewerTimeZone } from "@/server/page-auth";
import { listMovements } from "@/server/services/inventory";
import { getProduct } from "@/server/services/products";
import { searchParamsToObject } from "@/server/validation/common";

export const metadata: Metadata = { title: "Stock ledger" };

const TYPES = [
  { value: "", label: "All reasons" },
  { value: "received", label: "Received" },
  { value: "returned", label: "Returned" },
  { value: "correction", label: "Count correction" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost / shrinkage" },
  { value: "order_reserved", label: "Reserved by order" },
  { value: "order_released", label: "Released by cancel" },
];

export default async function InventoryPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { workspaceId } = await params;
  const sp = searchParamsToObject(await searchParams);
  const actor = await requireActor(workspaceId, "inventory:read");
  const tz = await viewerTimeZone();
  let filterError: string | undefined;
  const result = await load(() =>
    listMovements(actor, { ...sp, tz }).catch((err) => {
      if (err instanceof AppError && err.code === "VALIDATION_ERROR") {
        filterError = Object.values(err.fields ?? {})[0] ?? err.message;
        return listMovements(actor, { tz });
      }
      throw err;
    }),
  );
  const product = sp.productId ? await getProduct(actor, sp.productId).catch(() => null) : null;
  const base = `/w/${workspaceId}/inventory`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit trail"
        title="Stock ledger"
        description="Append-only history of every stock change: manual adjustments and order reservations. Each row records who did it and the quantity that resulted."
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <SelectFilter name="type" label="Reason" value={sp.type} options={TYPES} />
          {product && (
            <Link href={withParams(base, sp, { productId: undefined, page: undefined })} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3 py-1 text-xs hover:border-ink">
              {product.name} <span className="font-mono text-ink-mute">{product.sku}</span>
              <X className="h-3 w-3" />
            </Link>
          )}
        </div>
        <DateRange from={sp.from} to={sp.to} allowClear />
      </div>
      {filterError && <p className="text-sm text-st-out">{filterError}</p>}
      {result.items.length === 0 ? (
        <EmptyState title="No movements" body={sp.type || sp.from || sp.to || sp.productId ? "Nothing matches these filters." : "Stock changes will appear here as they happen."} />
      ) : (
        <>
          <MovementsTable rows={result.items} workspaceId={workspaceId} tz={tz} />
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} noun="movements" hrefFor={(n) => withParams(base, sp, { page: n })} />
        </>
      )}
    </div>
  );
}
