"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { api, ApiError, type FieldErrors } from "@/lib/api-client";
import { FieldError, Label } from "@/components/ui";

type Mode = "login" | "register";
const FIELDS: Record<Mode, { name: string; label: string; type: string; autoComplete: string; hint?: string }[]> = {
  login: [
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
  ],
  register: [
    { name: "name", label: "Your name", type: "text", autoComplete: "name" },
    { name: "email", label: "Work email", type: "email", autoComplete: "email" },
    { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "8+ characters" },
    { name: "workspaceName", label: "Business name", type: "text", autoComplete: "organization", hint: "Your first workspace" },
  ],
};

export function AuthForm({ mode, demo }: { mode: Mode; demo?: { email: string; password: string }[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    setFormError(undefined);
    try {
      const data = await api<{ workspaceId?: string }>(`/api/auth/${mode}`, { method: "POST", body: values });
      router.replace(data?.workspaceId ? `/w/${data.workspaceId}` : "/workspaces");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        if (!err.fields || err.status === 401) setFormError(err.message);
      } else setFormError("Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise">
      <p className="eyebrow">{mode === "login" ? "Welcome back" : "Start in a minute"}</p>
      <h2 className="mt-2 font-display text-[2.6rem] leading-none">{mode === "login" ? "Sign in" : "Create your account"}</h2>

      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        {formError && (
          <div role="alert" className="rounded-md border border-[#F4C7C3] bg-[#FDF0EF] px-3 py-2 text-sm text-st-out">
            {formError}
          </div>
        )}
        {FIELDS[mode].map((f) => (
          <div key={f.name}>
            <Label htmlFor={f.name} hint={f.hint}>
              {f.label}
            </Label>
            <input
              id={f.name}
              name={f.name}
              type={f.type}
              autoComplete={f.autoComplete}
              required
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              aria-invalid={!!errors[f.name]}
              aria-describedby={errors[f.name] ? `${f.name}-err` : undefined}
              className={`field ${errors[f.name] ? "field-invalid" : ""}`}
            />
            <FieldError id={`${f.name}-err`} message={errors[f.name]} />
          </div>
        ))}
        <button type="submit" disabled={busy} className="btn-primary group w-full py-2.5">
          {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
          {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-mute">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link href={mode === "login" ? "/register" : "/login"} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>

      {demo && demo.length > 0 && (
        <div className="mt-10 rounded-lg border border-line bg-paper-raised p-4">
          <p className="eyebrow">Demo access</p>
          <div className="mt-3 space-y-2">
            {demo.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => setValues({ email: d.email, password: d.password })}
                className="flex w-full items-center justify-between rounded-md border border-line px-3 py-2 text-left text-sm hover:border-ink"
              >
                <span>
                  <span className="font-medium">{d.email.startsWith("owner") ? "Owner" : "Staff"}</span>
                  <span className="ml-2 font-mono text-xs text-ink-mute">{d.email}</span>
                </span>
                <span className="text-xs text-ink-mute">Fill</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-faint">Password for both: {demo[0].password}</p>
        </div>
      )}
    </div>
  );
}
