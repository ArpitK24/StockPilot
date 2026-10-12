import type { Metadata } from "next";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { MovementsTable } from "@/components/movements-table";
import { ProductActiveToggle } from "@/components/product-active-toggle";
import { ProductForm } from "@/components/product-form";
import { stockLevel } from "@/components/status";
import { StockAdjust } from "@/components/stock-adjust";
import { DateRange } from "@/components/date-range";
import { EmptyState, PageHeader, Pagination, withParams } from "@/components/ui";
import { can } from "@/server/authz";
import { load, requireActor, viewerTimeZone } from "@/server/page-auth";
import { listMovements } from "@/server/services/inventory";
import { getProduct } from "@/server/services/products";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; productId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { workspaceId, productId } = await params;
  const sp = await searchParams;
  const actor = await requireActor(workspaceId, "product:read");
  const tz = await viewerTimeZone();
  const product = await load(() => getProduct(actor, productId));
  const history = await load(() =>
    listMovements(actor, { productId, page: sp.page, pageSize: 15, from: sp.from, to: sp.to, tz }).catch(() => listMovements(actor, { productId, pageSize: 15, tz })),
  );
  const level = stockLevel(product.stockQuantity, product.lowStockThreshold);
  const base = `/w/${workspaceId}/products/${productId}`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <Link href={`/w/${workspaceId}/products`} className="hover:text-ink">
            ← Products
          </Link>
        }
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-paper-sunk px-1.5 py-0.5 font-mono text-xs text-ink-soft">{product.sku}</span>
            {!product.isActive && <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider text-paper">Inactive</span>}
            <span>Added {formatDate(product.createdAt, tz)}</span>
          </span>
        }
        actions={can(actor.role, "product:write") && <ProductActiveToggle workspaceId={workspaceId} productId={product.id} isActive={product.isActive} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <section className="panel overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
            <div className="p-5">
              <p className="eyebrow">On hand</p>
              <p className={`num mt-2 font-display text-5xl leading-none ${level === "out" ? "text-st-out" : level === "low" ? "text-st-low" : ""}`}>{product.stockQuantity}</p>
            </div>
            <div className="p-5">
              <p className="eyebrow">Reorder at</p>
              <p className="num mt-2 font-display text-5xl leading-none text-ink-mute">{product.lowStockThreshold}</p>
            </div>
            <div className="p-5">
              <p className="eyebrow">Unit price</p>
              <p className="num mt-2 font-display text-[2.1rem] leading-none sm:text-5xl">{formatMoney(product.unitPrice)}</p>
            </div>
          </div>
          <div className="p-5">
            <h2 className="mb-4 text-sm font-medium">Adjust stock</h2>
            {can(actor.role, "inventory:adjust") ? (
              <StockAdjust workspaceId={workspaceId} productId={product.id} current={product.stockQuantity} productName={product.name} />
            ) : (
              <p className="text-sm text-ink-mute">You can view stock but not adjust it.</p>
            )}
          </div>
        </section>

        <section className="panel p-6">
          {can(actor.role, "product:write") ? (
            <>
              <h2 className="mb-5 text-sm font-medium">Details</h2>
              <ProductForm
                workspaceId={workspaceId}
                product={{
                  id: product.id,
                  name: product.name,
                  sku: product.sku,
                  description: product.description,
                  unitPrice: product.unitPrice,
                  lowStockThreshold: product.lowStockThreshold,
                }}
              />
            </>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-medium">Details</h2>
              <p className="whitespace-pre-line text-sm text-ink-soft">{product.description || "No description."}</p>
              <p className="mt-4 text-xs text-ink-mute">Only owners can edit catalogue details.</p>
            </>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-3xl">Stock history</h2>
            <p className="text-sm text-ink-mute">Every change to this product&apos;s stock, newest first.</p>
          </div>
          <DateRange from={sp.from} to={sp.to} allowClear />
        </div>
        {history.items.length === 0 ? (
          <EmptyState title="No movements" body="Nothing in this date range." />
        ) : (
          <>
            <MovementsTable rows={history.items} workspaceId={workspaceId} tz={tz} showProduct={false} />
            <Pagination page={history.page} pageCount={history.pageCount} total={history.total} noun="movements" hrefFor={(n) => withParams(base, sp, { page: n })} />
          </>
        )}
      </section>
    </div>
  );
}
