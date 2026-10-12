"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, type FieldErrors } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import { FieldError, Label } from "./ui";
import { useToast } from "./toast";

export function AddMemberForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "owner">("staff");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setErrors({});
        try {
          const m = await api<{ name: string }>(`/api/workspaces/${workspaceId}/members`, { method: "POST", body: { email, role } });
          toast({ kind: "success", title: `${m.name} added as ${role}` });
          setEmail("");
          router.refresh();
        } catch (err) {
          if (err instanceof ApiError) setErrors(err.fields ?? { email: err.message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <Label htmlFor="member-email">Email of a registered user</Label>
        <input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@business.com" className={`field ${errors.email ? "field-invalid" : ""}`} />
      </div>
      <div>
        <Label htmlFor="member-role">Role</Label>
        <select id="member-role" value={role} onChange={(e) => setRole(e.target.value as "staff" | "owner")} className="field">
          <option value="staff">Staff</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      <button className="btn-primary" disabled={busy || !email}>
        {busy ? "Adding…" : "Add member"}
      </button>
      <div className="sm:col-span-3">
        <FieldError message={errors.email} />
      </div>
    </form>
  );
}

export function RemoveMember({ workspaceId, userId, name }: { workspaceId: string; userId: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-ink-mute hover:text-st-out">
        Remove
      </button>
      <ConfirmDialog
        open={open}
        title={`Remove ${name}?`}
        confirmLabel="Remove"
        tone="danger"
        busy={busy}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" });
            toast({ kind: "success", title: `${name} removed` });
            setOpen(false);
            router.refresh();
          } catch (err) {
            toast({ kind: "error", title: "Couldn't remove", body: err instanceof ApiError ? err.message : undefined });
          } finally {
            setBusy(false);
          }
        }}
      >
        They lose access to this workspace immediately. Their past orders and stock changes stay in the history.
      </ConfirmDialog>
    </>
  );
}
