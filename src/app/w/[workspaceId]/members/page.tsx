import type { Metadata } from "next";
import { formatDate } from "@/lib/format";
import { AddMemberForm, RemoveMember } from "@/components/members";
import { PageHeader } from "@/components/ui";
import { can, PERMISSIONS } from "@/server/authz";
import { requireActor, viewerTimeZone } from "@/server/page-auth";
import { listMembers } from "@/server/services/workspaces";

export const metadata: Metadata = { title: "Team" };

const PERMISSION_LABEL: Partial<Record<keyof typeof PERMISSIONS, string>> = {
  "product:write": "Create, edit & deactivate products",
  "inventory:adjust": "Record stock adjustments",
  "order:create": "Create orders",
  "order:transition": "Confirm, complete & cancel orders",
  "dashboard:read": "View dashboard & history",
  "member:manage": "Add & remove members",
};

export default async function MembersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const actor = await requireActor(workspaceId, "member:read");
  const tz = await viewerTimeZone();
  const members = await listMembers(actor);
  const manage = can(actor.role, "member:manage");

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Workspace" title="Team" description="People who can work in this workspace, and what each role can do." />

      {manage && (
        <section className="panel p-5">
          <h2 className="mb-1 text-sm font-medium">Add someone</h2>
          <p className="mb-4 text-xs text-ink-mute">They register their own account first, then you add them here by email.</p>
          <AddMemberForm workspaceId={workspaceId} />
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-line bg-paper-raised">
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-4 px-5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper-sunk text-xs font-semibold">
                {m.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name} {m.userId === actor.userId && <span className="text-xs font-normal text-ink-mute">(you)</span>}
                </p>
                <p className="truncate text-xs text-ink-mute">{m.email}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${m.role === "owner" ? "bg-ink text-paper" : "bg-paper-sunk text-ink-soft"}`}>{m.role === "owner" ? "Owner" : "Staff"}</span>
              <span className="hidden w-28 text-right text-xs text-ink-mute sm:block">since {formatDate(m.joinedAt, tz)}</span>
              {manage && m.userId !== actor.userId ? <RemoveMember workspaceId={workspaceId} userId={m.userId} name={m.name} /> : <span className="w-12" />}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-display text-3xl">Roles</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-paper-raised">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-mute">
              <tr className="[&>th]:px-5 [&>th]:py-2.5 [&>th]:font-medium">
                <th>Permission</th>
                <th className="text-center">Owner</th>
                <th className="text-center">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {Object.entries(PERMISSION_LABEL).map(([key, label]) => {
                const roles = PERMISSIONS[key as keyof typeof PERMISSIONS] as readonly string[];
                return (
                  <tr key={key} className="[&>td]:px-5 [&>td]:py-2.5">
                    <td>{label}</td>
                    <td className="text-center">{roles.includes("owner") ? "●" : <span className="text-ink-faint">—</span>}</td>
                    <td className="text-center">{roles.includes("staff") ? "●" : <span className="text-ink-faint">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-mute">Enforced by the server on every request; hidden buttons are only a convenience.</p>
      </section>
    </div>
  );
}
