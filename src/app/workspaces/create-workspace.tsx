"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { FieldError } from "@/components/ui";

export function CreateWorkspace() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="btn-outline mt-4">
        <Plus className="h-4 w-4" /> New workspace
      </button>
    );

  return (
    <form
      className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(undefined);
        try {
          const ws = await api<{ id: string }>("/api/workspaces", { method: "POST", body: { name } });
          router.push(`/w/${ws.id}`);
        } catch (err) {
          setError(err instanceof ApiError ? (err.fields?.name ?? err.message) : "Something went wrong");
          setBusy(false);
        }
      }}
    >
      <div className="flex-1">
        <input autoFocus aria-label="Workspace name" placeholder="e.g. Northside Coffee Supply" value={name} onChange={(e) => setName(e.target.value)} className={`field ${error ? "field-invalid" : ""}`} />
        <FieldError message={error} />
      </div>
      <button className="btn-primary" disabled={busy}>
        {busy ? "Creating…" : "Create"}
      </button>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
