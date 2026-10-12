import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out";
import { requireUser } from "@/server/page-auth";
import { listMyWorkspaces } from "@/server/services/workspaces";
import { CreateWorkspace } from "./create-workspace";

export const metadata: Metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const user = await requireUser();
  const workspaces = await listMyWorkspaces(user.id);
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-10">
        <Logo />
        <div className="flex items-center gap-3 text-sm text-ink-mute">
          <span className="hidden sm:inline">{user.email}</span>
          <SignOutButton className="btn-ghost" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <p className="eyebrow">Signed in as {user.name}</p>
        <h1 className="mt-3 font-display text-5xl leading-none">Choose a workspace</h1>
        <p className="mt-3 text-sm text-ink-mute">Each workspace is a separate business with its own products, stock and orders.</p>

        <ul className="mt-10 divide-y divide-line overflow-hidden rounded-lg border border-line bg-paper-raised">
          {workspaces.map((w) => (
            <li key={w.id}>
              <Link href={`/w/${w.id}`} className="group flex items-center gap-4 px-5 py-4 hover:bg-paper">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-ink font-display text-xl text-paper">{w.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{w.name}</span>
                  <span className="text-xs text-ink-mute">
                    {w.role === "owner" ? "Owner" : "Staff"} · {w.members ?? 1} {w.members === 1 ? "member" : "members"}
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-ink-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
              </Link>
            </li>
          ))}
          {workspaces.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-mute">You&apos;re not in any workspace yet. Create one to get started.</li>}
        </ul>
        <CreateWorkspace />
      </main>
    </div>
  );
}
