"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { api, ApiError, type FieldErrors } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import { FieldError, Label } from "./ui";
import { useToast } from "./toast";

const REASONS = [
  { value: "received", label: "Received", dir: 1, hint: "Delivery from a supplier" },
  { value: "returned", label: "Returned", dir: 1, hint: "Customer return back to shelf" },
  { value: "correction", label: "Correction", dir: 0, hint: "Cycle count fix, up or down" },
  { value: "damaged", label: "Damaged", dir: -1, hint: "Broken, expired or unsellable" },
  { value: "lost", label: "Lost", dir: -1, hint: "Shrinkage or missing" },
] as const;

export function StockAdjust({ workspaceId, productId, current, productName }: { workspaceId: string; productId: string; current: number; productName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<(typeof REASONS)[number]["value"]>("received");
  const [qty, setQty] = useState("");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const reason = REASONS.find((r) => r.value === type)!;
  const sign = reason.dir === 0 ? direction : reason.dir;
  const n = Number(qty);
  const valid = /^\d+$/.test(qty) && n > 0;
  const delta = valid ? sign * n : 0;
  const after = current + delta;

  function review(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return setErrors({ quantityChange: "Enter a whole number greater than zero" });
    if (after < 0) return setErrors({ quantityChange: `Only ${current} on hand; this would go below zero` });
    setErrors({});
    setConfirming(true);
  }

  async function commit() {
    setBusy(true);
    try {
      await api(`/api/workspaces/${workspaceId}/products/${productId}/adjustments`, { method: "POST", body: { type, quantityChange: delta, note: note || null } });
      toast({ kind: "success", title: "Stock updated", body: `${productName}: ${current} → ${after}` });
      setQty("");
      setNote("");
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError) {
        setErrors(err.fields ?? { quantityChange: err.message });
        toast({ kind: "error", title: "Adjustment rejected", body: err.message });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={review} noValidate className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-soft">Reason</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 lg:grid-cols-2 xl:grid-cols-5">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setType(r.value)}
              aria-pressed={type === r.value}
              className={clsx(
                "rounded-md border px-2 py-1.5 text-xs transition-colors",
                type === r.value ? "border-ink bg-ink text-paper" : "border-line-strong bg-paper-raised text-ink-soft hover:border-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-mute">{reason.hint}</p>
      </fieldset>

      <div>
        <Label htmlFor="adj-qty">Quantity</Label>
        <div className="flex gap-2">
          {reason.dir === 0 && (
            <div className="inline-flex rounded-md border border-line-strong p-0.5">
              <button type="button" aria-label="Add" aria-pressed={direction === 1} onClick={() => setDirection(1)} className={clsx("rounded px-2", direction === 1 ? "bg-ink text-paper" : "text-ink-mute")}>
                <Plus className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Remove" aria-pressed={direction === -1} onClick={() => setDirection(-1)} className={clsx("rounded px-2", direction === -1 ? "bg-ink text-paper" : "text-ink-mute")}>
                <Minus className="h-4 w-4" />
              </button>
            </div>
          )}
          <input
            id="adj-qty"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            aria-invalid={!!errors.quantityChange}
            className={`field font-mono ${errors.quantityChange ? "field-invalid" : ""}`}
          />
        </div>
        <FieldError message={errors.quantityChange} />
      </div>
      <div>
        <Label htmlFor="adj-note" hint="Optional">Note</Label>
        <input id="adj-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="PO number, count sheet…" className="field" />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md bg-paper-sunk px-3 py-2 font-mono text-sm">
        <span className="text-ink-mute">Result</span>
        <span className="num">
          {current} <span className={delta > 0 ? "text-st-completed" : delta < 0 ? "text-st-low" : "text-ink-faint"}>{delta >= 0 ? `+${delta}` : delta}</span> ={" "}
          <b className={after < 0 ? "text-st-out" : ""}>{after}</b>
        </span>
      </div>
      <button className="btn-primary w-full" disabled={busy || !valid}>
        Review adjustment
      </button>

      <ConfirmDialog
        open={confirming}
        title="Record this adjustment?"
        confirmLabel="Record adjustment"
        busy={busy}
        onConfirm={commit}
        onClose={() => setConfirming(false)}
      >
        <p>
          <b>{reason.label}</b> {delta > 0 ? `+${delta}` : delta} for {productName}. Stock goes from <b>{current}</b> to <b>{after}</b>.
        </p>
        <p className="mt-2 text-xs text-ink-mute">It&apos;s added to the ledger with your name and can&apos;t be edited later, only offset by another adjustment.</p>
      </ConfirmDialog>
    </form>
  );
}
