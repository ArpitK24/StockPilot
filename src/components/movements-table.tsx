import Link from "next/link";
import { formatDateTime, MOVEMENT_LABEL, signed } from "@/lib/format";

type Row = {
  id: string;
  type: string;
  quantityChange: number;
  resultingQuantity: number;
  note: string | null;
  orderId: string | null;
  createdAt: Date | string;
  productId: string;
  productName: string;
  productSku: string;
  actorName: string;
};

export function MovementsTable({ rows, workspaceId, tz, showProduct = true }: { rows: Row[]; workspaceId: string; tz: string; showProduct?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-paper-raised">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-line text-left text-xs text-ink-mute">
          <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
            <th>When</th>
            {showProduct && <th>Product</th>}
            <th>Reason</th>
            <th className="text-right">Change</th>
            <th className="text-right">Resulting</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((m) => (
            <tr key={m.id} className="[&>td]:px-4 [&>td]:py-2.5">
              <td className="whitespace-nowrap font-mono text-xs text-ink-mute">{formatDateTime(m.createdAt, tz)}</td>
              {showProduct && (
                <td className="max-w-[16rem]">
                  <Link href={`/w/${workspaceId}/products/${m.productId}`} className="block truncate hover:underline">
                    {m.productName}
                  </Link>
                  <span className="font-mono text-2xs text-ink-mute">{m.productSku}</span>
                </td>
              )}
              <td>
                <span className="text-ink-soft">{MOVEMENT_LABEL[m.type] ?? m.type}</span>
                {m.orderId && (
                  <Link href={`/w/${workspaceId}/orders/${m.orderId}`} className="ml-1.5 font-mono text-xs text-st-confirmed hover:underline">
                    order ↗
                  </Link>
                )}
                {m.note && <p className="max-w-[18rem] truncate text-xs text-ink-mute">{m.note}</p>}
              </td>
              <td className={`num text-right font-mono ${m.quantityChange > 0 ? "text-st-completed" : "text-st-low"}`}>{signed(m.quantityChange)}</td>
              <td className="num text-right font-mono">{m.resultingQuantity}</td>
              <td className="whitespace-nowrap text-xs text-ink-mute">{m.actorName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
