"use client";

import clsx from "clsx";
import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Minus, PackageSearch, Plus, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { useToast } from "./toast";

type Product = { id: string; name: string; sku: string; unitPrice: string; stockQuantity: number; lowStockThreshold: number };
type Line = Product & { quantity: number };

export function OrderBuilder({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[] | null>(null);
  const [searchError, setSearchError] = useState<string>();
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [lineError, setLineError] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  // One key per draft: a double-click or network retry can't create two orders.
  const [idempotencyKey, setKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const ctrl = { cancelled: false };
    const t = setTimeout(async () => {
      try {
        const data = await api<Product[]>(`/api/workspaces/${workspaceId}/orderable-products?q=${encodeURIComponent(q)}`);
        if (!ctrl.cancelled) {
          setResults(data);
          setSearchError(undefined);
        }
      } catch (e) {
        if (!ctrl.cancelled) setSearchError(e instanceof ApiError ? e.message : "Search failed");
      }
    }, 200);
    return () => {
      ctrl.cancelled = true;
      clearTimeout(t);
    };
  }, [q, workspaceId]);

  const estimate = useMemo(() => lines.reduce((s, l) => s.plus(new Decimal(l.unitPrice).times(l.quantity || 0)), new Decimal(0)).toFixed(2), [lines]);
  const units = lines.reduce((s, l) => s + (l.quantity || 0), 0);
  const overStock = lines.some((l) => l.quantity > l.stockQuantity);

  function add(p: Product) {
    setLines((ls) => (ls.some((l) => l.id === p.id) ? ls.map((l) => (l.id === p.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { ...p, quantity: 1 }]));
    setFormError(undefined);
  }
  function setQty(id: string, quantity: number) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, quantity: Math.max(0, Math.min(100000, quantity)) } : l)));
    setLineError((e) => ({ ...e, [id]: "" }));
  }

  async function submit() {
    if (busy) return;
    if (lines.length === 0) return setFormError("Add at least one product.");
    if (lines.some((l) => !l.quantity)) return setFormError("Every line needs a quantity of at least 1.");
    setBusy(true);
    setFormError(undefined);
    try {
      const order = await api<{ id: string; number: number; total: string }>(`/api/workspaces/${workspaceId}/orders`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: { items: lines.map((l) => ({ productId: l.id, quantity: l.quantity })), note: note || null },
      });
      toast({ kind: "success", title: `Order #${order.number} placed`, body: `${formatMoney(order.total)} · stock reserved` });
      router.push(`/w/${workspaceId}/orders/${order.id}`);
    } catch (err) {
      setBusy(false);
      setKey(crypto.randomUUID()); // the attempt failed and rolled back; a fresh try is a new request
      if (err instanceof ApiError) {
        const pid = err.details?.productId as string | undefined;
        if (pid) {
          setLineError({ [pid]: err.message });
          if (typeof err.details?.available === "number") setLines((ls) => ls.map((l) => (l.id === pid ? { ...l, stockQuantity: err.details!.available as number } : l)));
        }
        setFormError(err.message);
      } else setFormError("Something went wrong");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
      <section className="panel flex max-h-[38rem] flex-col">
        <div className="border-b border-line p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find active products by name or SKU" aria-label="Find products" className="field pl-9" autoFocus />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {searchError && <p className="p-4 text-sm text-st-out">{searchError}</p>}
          {results === null && !searchError && (
            <div className="space-y-2 p-4" aria-busy>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-md bg-paper-sunk" />
              ))}
            </div>
          )}
          {results?.length === 0 && (
            <div className="flex flex-col items-center p-10 text-center text-sm text-ink-mute">
              <PackageSearch className="mb-2 h-5 w-5" />
              {q ? "No active products match." : "No active products yet."}
            </div>
          )}
          <ul className="divide-y divide-line">
            {results?.map((p) => {
              const inCart = lines.find((l) => l.id === p.id)?.quantity ?? 0;
              const out = p.stockQuantity === 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={out}
                    onClick={() => add(p)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="font-mono text-2xs text-ink-mute">
                        {p.sku} · <span className={p.stockQuantity <= p.lowStockThreshold ? "text-st-low" : ""}>{p.stockQuantity} in stock</span>
                      </span>
                    </span>
                    <span className="num font-mono text-sm">{formatMoney(p.unitPrice)}</span>
                    <span className={clsx("grid h-7 w-7 place-items-center rounded-md border", inCart ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-mute")}>
                      {inCart ? <span className="font-mono text-xs">{inCart}</span> : <Plus className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="panel flex flex-col">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-medium">Order lines</h2>
          <span className="font-mono text-xs text-ink-mute">
            {lines.length} lines · {units} units
          </span>
        </div>
        {lines.length === 0 ? (
          <div className="rule-grid m-5 flex flex-1 flex-col items-center justify-center rounded-md border border-dashed border-line-strong py-14 text-center">
            <p className="font-display text-2xl">Nothing here yet</p>
            <p className="mt-1 text-sm text-ink-mute">Pick products on the left to add them.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l) => {
              const over = l.quantity > l.stockQuantity;
              const err = lineError[l.id];
              return (
                <li key={l.id} className={clsx("px-5 py-3", (over || err) && "bg-[#FFF6F2]")}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="font-mono text-2xs text-ink-mute">
                        {l.sku} · {formatMoney(l.unitPrice)} each
                      </p>
                    </div>
                    <div className="flex items-center rounded-md border border-line-strong bg-paper-raised">
                      <button type="button" aria-label={`Decrease ${l.name}`} onClick={() => setQty(l.id, l.quantity - 1)} className="px-2 py-1.5 text-ink-mute hover:text-ink">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        aria-label={`Quantity of ${l.name}`}
                        inputMode="numeric"
                        value={l.quantity || ""}
                        onChange={(e) => setQty(l.id, Number(e.target.value.replace(/\D/g, "")) || 0)}
                        className="w-12 bg-transparent text-center font-mono text-sm focus:outline-none"
                      />
                      <button type="button" aria-label={`Increase ${l.name}`} onClick={() => setQty(l.id, l.quantity + 1)} className="px-2 py-1.5 text-ink-mute hover:text-ink">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="num hidden w-24 text-right font-mono text-sm sm:block">{formatMoney(new Decimal(l.unitPrice).times(l.quantity || 0).toFixed(2))}</span>
                    <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="text-ink-faint hover:text-st-out">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {(over || err) && <p className="mt-1.5 text-xs text-st-out">{err || `Only ${l.stockQuantity} in stock`}</p>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-auto space-y-4 border-t border-line p-5">
          <div>
            <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-ink-soft">
              Note <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <input id="note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Customer, delivery details…" className="field" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="eyebrow">Estimated total</p>
              <p className="num mt-1 font-display text-4xl leading-none">{formatMoney(estimate)}</p>
            </div>
            <p className="max-w-[14rem] text-right text-2xs text-ink-faint">The server recalculates prices and totals when it reserves the stock.</p>
          </div>
          {formError && (
            <p role="alert" className="rounded-md border border-[#F4C7C3] bg-[#FDF0EF] px-3 py-2 text-sm text-st-out">
              {formError}
            </p>
          )}
          <button type="button" onClick={submit} disabled={busy || lines.length === 0 || overStock} className="btn-signal w-full py-2.5">
            {busy ? "Reserving stock…" : "Place order & reserve stock"}
          </button>
        </div>
      </section>
    </div>
  );
}
