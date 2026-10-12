"use client";

import { useEffect, useRef } from "react";

/** Accessible modal built on <dialog>: focus trap, Esc to close, backdrop click to dismiss. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "default",
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !busy && onClose()}
      className="w-[min(92vw,26rem)] rounded-xl border border-line bg-paper-raised p-0 text-ink shadow-pop backdrop:bg-night/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5">
        <h2 className="font-display text-2xl leading-tight">{title}</h2>
        <div className="mt-2 text-sm text-ink-soft">{children}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-paper px-5 py-3">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
          Keep it
        </button>
        <button type="button" autoFocus className={tone === "danger" ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
