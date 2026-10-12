"use client";

import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

function today() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function minus(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Date range control that writes ?from=&to= (calendar days in the viewer's zone). */
export function DateRange({ from, to, allowClear }: { from?: string; to?: string; allowClear?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [custom, setCustom] = useState(false);

  function apply(next: { from?: string; to?: string }) {
    const p = new URLSearchParams(sp.toString());
    for (const k of ["from", "to"] as const) next[k] ? p.set(k, next[k]!) : p.delete(k);
    p.delete("page");
    router.push(`${pathname}?${p.toString()}`);
  }
  const t = today();
  const activePreset = to === t ? PRESETS.find((p) => from === minus(t, p.days - 1))?.label : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-line-strong bg-paper-raised p-0.5" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setCustom(false);
              apply({ from: minus(t, p.days - 1), to: t });
            }}
            className={clsx("rounded px-2.5 py-1 font-mono text-xs", activePreset === p.label && !custom ? "bg-ink text-paper" : "text-ink-mute hover:text-ink")}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom((c) => !c)}
          className={clsx("rounded px-2.5 py-1 font-mono text-xs", (custom || (!activePreset && (from || to))) ? "bg-ink text-paper" : "text-ink-mute hover:text-ink")}
        >
          Custom
        </button>
      </div>
      {(custom || (!activePreset && (from || to))) && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            apply({ from: String(f.get("from") || "") || undefined, to: String(f.get("to") || "") || undefined });
          }}
        >
          <input name="from" type="date" defaultValue={from} max={t} aria-label="From" className="field w-auto py-1 text-xs" />
          <span className="text-ink-faint">→</span>
          <input name="to" type="date" defaultValue={to} aria-label="To" className="field w-auto py-1 text-xs" />
          <button className="btn-outline py-1 text-xs">Apply</button>
        </form>
      )}
      {allowClear && (from || to) && (
        <button type="button" onClick={() => apply({})} className="text-xs text-ink-mute underline underline-offset-4 hover:text-ink">
          Any date
        </button>
      )}
    </div>
  );
}
