"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

export function ProductActiveToggle({ workspaceId, productId, isActive }: { workspaceId: string; productId: string; isActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className={isActive ? "btn-outline" : "btn-primary"} onClick={() => setOpen(true)}>
        {isActive ? "Deactivate" : "Reactivate"}
      </button>
      <ConfirmDialog
        open={open}
        title={isActive ? "Deactivate this product?" : "Reactivate this product?"}
        confirmLabel={isActive ? "Deactivate" : "Reactivate"}
        tone={isActive ? "danger" : "default"}
        busy={busy}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api(`/api/workspaces/${workspaceId}/products/${productId}`, { method: "PATCH", body: { isActive: !isActive } });
            toast({ kind: "success", title: isActive ? "Product deactivated" : "Product reactivated" });
            setOpen(false);
            router.refresh();
          } catch (err) {
            toast({ kind: "error", title: "Couldn't update", body: err instanceof ApiError ? err.message : undefined });
          } finally {
            setBusy(false);
          }
        }}
      >
        {isActive
          ? "It can't be added to new orders. Existing orders, its stock and its history stay exactly as they are."
          : "It becomes available for new orders again."}
      </ConfirmDialog>
    </>
  );
}
