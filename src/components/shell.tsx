"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, ChevronsUpDown, History, LayoutGrid, Menu, ReceiptText, Users, X, Check } from "lucide-react";
import { Logo } from "./ui";
import { SignOutButton } from "./sign-out";

type WS = { id: string; name: string; role?: "owner" | "staff" };

export function Shell({ workspace, workspaces, user, children }: { workspace: WS; workspaces: WS[]; user: { name: string; email: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const base = `/w/${workspace.id}`;
  const nav = [
    { href: base, label: "Overview", icon: LayoutGrid, exact: true },
    { href: `${base}/products`, label: "Products", icon: Boxes },
    { href: `${base}/orders`, label: "Orders", icon: ReceiptText },
    { href: `${base}/inventory`, label: "Stock ledger", icon: History },
    { href: `${base}/members`, label: "Team", icon: Users },
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <Logo light />
        <button className="text-night-mute lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <WorkspaceSwitcher current={workspace} all={workspaces} />
      <nav className="mt-6 flex-1 space-y-0.5 px-3" aria-label="Main">
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-night-raised text-paper" : "text-night-mute hover:bg-night-raised/60 hover:text-paper",
              )}
            >
              {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-signal" />}
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-night-line p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-night-raised text-xs font-semibold text-paper ring-1 ring-night-line">
            {user.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium text-paper">{user.name}</p>
            <p className="truncate text-night-mute">{workspace.role === "owner" ? "Owner" : "Staff"}</p>
          </div>
        </div>
        <SignOutButton className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-night-mute hover:bg-night-raised hover:text-paper" />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="grain sticky top-0 hidden h-dvh bg-night lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-night/60" onClick={() => setOpen(false)} />
          <aside className="grain absolute inset-y-0 left-0 w-72 animate-rise bg-night">{sidebar}</aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="btn-ghost -ml-2 px-2">
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-medium">{workspace.name}</span>
        </header>
        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

function WorkspaceSwitcher({ current, all }: { current: WS; all: WS[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative px-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg border border-night-line bg-night-raised px-3 py-2.5 text-left hover:border-night-mute/50"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-paper font-display text-base text-ink">{current.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-paper">{current.name}</span>
          <span className="text-2xs text-night-mute">Workspace</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-night-mute" />
      </button>
      {open && (
        <div className="absolute inset-x-3 top-full z-50 mt-1 overflow-hidden rounded-lg border border-night-line bg-night-raised py-1 shadow-pop">
          {all.map((w) => (
            <Link key={w.id} href={`/w/${w.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-paper hover:bg-night">
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === current.id && <Check className="h-4 w-4 text-signal" />}
            </Link>
          ))}
          <Link href="/workspaces" className="block border-t border-night-line px-3 py-2 text-xs text-night-mute hover:text-paper">
            All workspaces…
          </Link>
        </div>
      )}
    </div>
  );
}
