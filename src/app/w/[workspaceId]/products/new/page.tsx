import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/server/page-auth";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  await requireActor(workspaceId, "product:write");
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader eyebrow={<Link href={`/w/${workspaceId}/products`} className="hover:text-ink">← Products</Link>} title="New product" />
      <div className="panel p-6">
        <ProductForm workspaceId={workspaceId} />
      </div>
    </div>
  );
}
