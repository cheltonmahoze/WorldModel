import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import type { Membership } from "@/components/app/org-switcher";
import { getAuth } from "@/server/auth/session";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");

  const [openInsights, openRisks, unreadNotifications] = await Promise.all([
    db.insight.count({ where: { organizationId: auth.organization.id, status: { in: ["DETECTED", "REVIEWING", "IN_PROGRESS"] } } }),
    db.risk.count({ where: { organizationId: auth.organization.id, status: { in: ["OPEN", "MITIGATING", "MONITORING"] } } }),
    db.notification.count({ where: { organizationId: auth.organization.id, userId: auth.user.id, readAt: null } }),
  ]);

  const counts = { insights: openInsights, risks: openRisks, notifications: unreadNotifications };

  const memberships: Membership[] = auth.memberships.map((membership) => ({
    id: membership.id,
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    organizationSlug: membership.organizationSlug,
    plan: membership.plan,
    role: membership.role,
    logoUrl: membership.logoUrl,
  }));

  const current: Membership =
    memberships.find((membership) => membership.organizationId === auth.organization.id) ?? memberships[0]!;

  return (
    <div className="flex min-h-dvh">
      <Sidebar counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{ name: auth.user.name, email: auth.user.email, avatarUrl: auth.user.avatarUrl, jobTitle: auth.user.jobTitle }}
          role={auth.role}
          membership={current}
          memberships={memberships}
          counts={counts}
        />
        <main className="min-w-0 flex-1 px-3 py-5 sm:px-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
