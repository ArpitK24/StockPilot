import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Boxes, Plus } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { relativeTime } from "@/lib/format";
import { SearchInput, Segmented } from "@/components/filter-bar";
import { StockMeter } from "@/components/status";
import { EmptyState, PageHeader, Pagination, withParams } from "@/components/ui";
import { can } from "@/server/authz";
import { load, requireActor } from "@/server/page-auth";
import { listProducts } from "@/server/services/products";
import { searchParamsToObject } from "@/server/validation/common";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { workspaceId } = await params;
  const sp = searchParamsToObject(await searchParams);
  const actor = await requireActor(workspaceId, "product:read");
  const result = await load(() => listProducts(actor, sp).catch(() => listProducts(actor, {})));
  const base = `/w/${workspaceId}/products`;
  const canWrite = can(actor.role, "product:write");
  const filtered = Boolean(sp.q || (sp.stock && sp.stock !== "all") || (sp.status && sp.status !== "active"));
  const sort = sp.sort ?? "name";
  const dir = sp.dir ?? "asc";

  const SortHead = ({ col, children, className }: { col: string; children: React.ReactNode; className?: string }) => {
    const active = sort === col;
    const nextDir = active && dir === "asc" ? "desc" : "asc";
    return (
      <th scope="col" className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
        <Link href={withParams(base, sp, { sort: col, dir: nextDir, page: undefined })} className="inline-flex items-center gap-1 hover:text-ink">
          {children}
          {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </Link>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Prices, stock on hand and reorder points. Stock only changes through orders and recorded adjustments."
        actions={
          canWrite && (
            <Link href={`${base}/new`} className="btn-signal">
              <Plus className="h-4 w-4" /> New product
            </Link>
          )
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="Search name or SKU" />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            name="stock"
            value={sp.stock ?? "all"}
            options={[
              { value: "all", label: "All stock" },
              { value: "low", label: "Low" },
              { value: "out", label: "Out" },
            ]}
          />
          <Segmented
            name="status"
            value={sp.status ?? "active"}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </div>

      {result.items.length === 0 ? (
        filtered ? (
          <EmptyState title="No matches" body="Nothing fits these filters. Try a broader search." action={<Link href={base} className="btn-outline">Clear filters</Link>} />
        ) : (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="No products yet"
            body={canWrite ? "Add your first product with its SKU, price and opening stock." : "An owner needs to add products before orders can be taken."}
            action={canWrite && <Link href={`${base}/new`} className="btn-signal">Add a product</Link>}
          />
        )
      ) : (
        <div>
          <div className="overflow-x-auto rounded-lg border border-line bg-paper-raised">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-mute">
                <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
                  <SortHead col="name">Product</SortHead>
                  <SortHead col="sku">SKU</SortHead>
                  <SortHead col="price" className="text-right">Unit price</SortHead>
                  <SortHead col="stock">On hand</SortHead>
                  <SortHead col="updated" className="hidden md:table-cell">Updated</SortHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.items.map((p) => (
                  <tr key={p.id} className="group relative hover:bg-paper [&>td]:px-4 [&>td]:py-3">
                    <td className="max-w-[18rem]">
                      <Link href={`${base}/${p.id}`} className="block truncate font-medium after:absolute after:inset-0">
                        {p.name}
                      </Link>
                      {!p.isActive && <span className="mt-0.5 inline-block rounded bg-paper-sunk px-1.5 py-px font-mono text-2xs uppercase tracking-wider text-ink-mute">Inactive</span>}
                    </td>
                    <td className="font-mono text-xs text-ink-soft">{p.sku}</td>
                    <td className="num text-right font-mono">{formatMoney(p.unitPrice)}</td>
                    <td>
                      <StockMeter qty={p.stockQuantity} threshold={p.lowStockThreshold} />
                    </td>
                    <td className="hidden text-xs text-ink-mute md:table-cell">{relativeTime(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} noun="products" hrefFor={(n) => withParams(base, sp, { page: n })} />
        </div>
      )}
    </div>
  );
}
