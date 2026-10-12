"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, type FieldErrors } from "@/lib/api-client";
import { FieldError, Label } from "./ui";
import { useToast } from "./toast";

type Values = { name: string; sku: string; description: string; unitPrice: string; stockQuantity: string; lowStockThreshold: string };

export function ProductForm({
  workspaceId,
  product,
}: {
  workspaceId: string;
  product?: { id: string; name: string; sku: string; description: string | null; unitPrice: string; lowStockThreshold: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(product);
  const [v, setV] = useState<Values>({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    description: product?.description ?? "",
    unitPrice: product?.unitPrice ?? "",
    stockQuantity: "0",
    lowStockThreshold: String(product?.lowStockThreshold ?? 5),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  // Client-side checks mirror the server for fast feedback; the server re-validates everything.
  function localValidate(): FieldErrors {
    const e: FieldErrors = {};
    if (!v.name.trim()) e.name = "Name is required";
    if (!v.sku.trim()) e.sku = "SKU is required";
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(v.unitPrice.trim())) e.unitPrice = "Enter a non-negative amount with up to 2 decimals";
    if (!/^\d+$/.test(v.lowStockThreshold)) e.lowStockThreshold = "Whole number, 0 or more";
    if (!editing && !/^\d+$/.test(v.stockQuantity)) e.stockQuantity = "Whole number, 0 or more";
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const local = localValidate();
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    const body = {
      name: v.name,
      sku: v.sku,
      description: v.description || null,
      unitPrice: v.unitPrice.trim(),
      lowStockThreshold: Number(v.lowStockThreshold),
      ...(editing ? {} : { stockQuantity: Number(v.stockQuantity) }),
    };
    try {
      const saved = await api<{ id: string }>(
        editing ? `/api/workspaces/${workspaceId}/products/${product!.id}` : `/api/workspaces/${workspaceId}/products`,
        { method: editing ? "PATCH" : "POST", body },
      );
      toast({ kind: "success", title: editing ? "Product saved" : "Product created" });
      if (editing) {
        router.refresh();
        setBusy(false);
      } else router.push(`/w/${workspaceId}/products/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        if (!err.fields) toast({ kind: "error", title: "Couldn't save", body: err.message });
      }
      setBusy(false);
    }
  }

  const field = (name: keyof Values, { className, ...props }: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <>
      <input
        id={name}
        name={name}
        value={v[name]}
        onChange={(e) => setV((s) => ({ ...s, [name]: e.target.value }))}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `${name}-err` : undefined}
        className={`field ${errors[name] ? "field-invalid" : ""} ${className ?? ""}`}
        {...props}
      />
      <FieldError id={`${name}-err`} message={errors[name]} />
    </>
  );

  const errorCount = Object.keys(errors).length;
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {errorCount > 0 && (
        <div role="alert" className="rounded-md border border-[#F4C7C3] bg-[#FDF0EF] px-3 py-2 text-sm text-st-out">
          {errorCount === 1 ? "One field needs attention." : `${errorCount} fields need attention.`}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <div>
          <Label htmlFor="name">Name</Label>
          {field("name", { placeholder: "Stoneware Mug 12oz", autoFocus: !editing })}
        </div>
        <div>
          <Label htmlFor="sku" hint="Unique in workspace">SKU</Label>
          {field("sku", { placeholder: "MUG-STN-12", className: "font-mono uppercase", autoCapitalize: "characters" })}
        </div>
      </div>
      <div>
        <Label htmlFor="description" hint="Optional">Description</Label>
        <textarea
          id="description"
          rows={3}
          value={v.description}
          onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))}
          className="field resize-y"
          placeholder="Notes for staff: supplier, size, colour…"
        />
      </div>
      <div className={`grid gap-5 ${editing ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        <div>
          <Label htmlFor="unitPrice">Unit price</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">$</span>
            {field("unitPrice", { inputMode: "decimal", placeholder: "0.00", className: "pl-7 font-mono" })}
          </div>
        </div>
        {!editing && (
          <div>
            <Label htmlFor="stockQuantity" hint="Logged as received">Opening stock</Label>
            {field("stockQuantity", { inputMode: "numeric", className: "font-mono" })}
          </div>
        )}
        <div>
          <Label htmlFor="lowStockThreshold" hint="Reorder point">Low-stock threshold</Label>
          {field("lowStockThreshold", { inputMode: "numeric", className: "font-mono" })}
        </div>
      </div>
      {editing && <p className="text-xs text-ink-mute">Price changes apply to new orders only; existing orders keep the price they were placed at.</p>}
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create product"}
        </button>
        {!editing && (
          <button type="button" className="btn-ghost" onClick={() => router.back()}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
