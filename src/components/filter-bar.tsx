"use client";

import clsx from "clsx";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Pushes filter changes into the URL; the server component re-queries the database. */
export function useFilterNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    p.delete("page");
    start(() => router.push(`${pathname}${p.size ? `?${p}` : ""}`));
  };
  return { set, sp, pending };
}

export function SearchInput({ name = "q", placeholder }: { name?: string; placeholder: string }) {
  const { set, sp, pending } = useFilterNav();
  const [value, setValue] = useState(sp.get(name) ?? "");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => set({ [name]: value.trim() || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className={clsx("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", pending ? "animate-pulse text-signal" : "text-ink-faint")} />
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="field pl-9 pr-8" />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => setValue("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function Segmented({ name, options, value }: { name: string; options: { value: string; label: string }[]; value: string }) {
  const { set } = useFilterNav();
  return (
    <div className="inline-flex rounded-md border border-line-strong bg-paper-raised p-0.5" role="group" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => set({ [name]: o.value })}
          className={clsx("rounded px-2.5 py-1 text-xs transition-colors", value === o.value ? "bg-ink text-paper" : "text-ink-mute hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SelectFilter({ name, options, value, label }: { name: string; options: { value: string; label: string }[]; value?: string; label: string }) {
  const { set } = useFilterNav();
  return (
    <select aria-label={label} value={value ?? ""} onChange={(e) => set({ [name]: e.target.value || undefined })} className="field w-auto py-1.5 pr-8 text-sm">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
