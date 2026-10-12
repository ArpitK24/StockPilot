import { requireActor } from "@/server/page-auth";
import { getWorkspace, listMyWorkspaces } from "@/server/services/workspaces";
import { Shell } from "@/components/shell";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const actor = await requireActor(workspaceId, "workspace:read");
  const [workspace, all] = await Promise.all([getWorkspace(actor), listMyWorkspaces(actor.userId)]);
  return (
    <Shell workspace={workspace} workspaces={all.map((w) => ({ id: w.id, name: w.name }))} user={{ name: actor.user.name, email: actor.user.email }}>
      {children}
    </Shell>
  );
}
