import type { Metadata } from "next";
import Link from "next/link";
import { OrderBuilder } from "@/components/order-builder";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/server/page-auth";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  await requireActor(workspaceId, "order:create");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href={`/w/${workspaceId}/orders`} className="hover:text-ink">
            ← Orders
          </Link>
        }
        title="New order"
        description="All lines succeed together or the order isn't created at all."
      />
      <OrderBuilder workspaceId={workspaceId} />
    </div>
  );
}
