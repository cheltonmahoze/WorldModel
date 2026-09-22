/**
 * RBAC — single source of truth for what each role can do.
 *
 * Roles are ordered (Owner > Admin > Manager > Analyst > Member) and every
 * permission is granted by role. Both the API layer (server) and the UI
 * (client) resolve permissions from this module, so a hidden button and its
 * endpoint always agree.
 */
export const ROLES = ["OWNER", "ADMIN", "MANAGER", "ANALYST", "MEMBER"] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_RANK: Record<RoleName, number> = {
  OWNER: 50,
  ADMIN: 40,
  MANAGER: 30,
  ANALYST: 20,
  MEMBER: 10,
};

export const ROLE_LABELS: Record<RoleName, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  ANALYST: "Analyst",
  MEMBER: "Member",
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  OWNER: "Full control, billing, deletion and ownership transfer.",
  ADMIN: "Manage people, integrations, automations and every record.",
  MANAGER: "Own pipeline, customers, teams and team-scoped reporting.",
  ANALYST: "Read everything, build reports, execute automations, no destructive writes.",
  MEMBER: "Work assigned records and act on intelligence.",
};

export const PERMISSIONS = [
  "org:read",
  "org:update",
  "org:delete",
  "billing:read",
  "billing:manage",
  "members:read",
  "members:invite",
  "members:update",
  "members:remove",
  "teams:read",
  "teams:manage",
  "customers:read",
  "customers:write",
  "customers:delete",
  "opportunities:read",
  "opportunities:write",
  "opportunities:delete",
  "activities:read",
  "activities:write",
  "insights:read",
  "insights:write",
  "risks:read",
  "risks:write",
  "automations:read",
  "automations:write",
  "integrations:read",
  "integrations:manage",
  "reports:read",
  "reports:write",
  "analytics:read",
  "analytics:export",
  "audit:read",
  "apikeys:read",
  "apikeys:manage",
  "webhooks:manage",
  "notifications:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const GRANTS: Record<RoleName, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => p !== "org:delete"),
  MANAGER: [
    "org:read",
    "members:read",
    "members:invite",
    "teams:read",
    "teams:manage",
    "customers:read",
    "customers:write",
    "customers:delete",
    "opportunities:read",
    "opportunities:write",
    "opportunities:delete",
    "activities:read",
    "activities:write",
    "insights:read",
    "insights:write",
    "risks:read",
    "risks:write",
    "automations:read",
    "automations:write",
    "integrations:read",
    "reports:read",
    "reports:write",
    "analytics:read",
    "analytics:export",
    "audit:read",
    "notifications:read",
  ],
  ANALYST: [
    "org:read",
    "members:read",
    "teams:read",
    "customers:read",
    "opportunities:read",
    "activities:read",
    "activities:write",
    "insights:read",
    "insights:write",
    "risks:read",
    "automations:read",
    "automations:write",
    "integrations:read",
    "reports:read",
    "reports:write",
    "analytics:read",
    "analytics:export",
    "audit:read",
    "notifications:read",
  ],
  MEMBER: [
    "org:read",
    "members:read",
    "teams:read",
    "customers:read",
    "opportunities:read",
    "opportunities:write",
    "activities:read",
    "activities:write",
    "insights:read",
    "insights:write",
    "risks:read",
    "risks:write",
    "automations:read",
    "integrations:read",
    "reports:read",
    "analytics:read",
    "notifications:read",
  ],
};

export function permissionsForRole(role: RoleName): Permission[] {
  return GRANTS[role] ?? [];
}

export function can(role: RoleName | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return GRANTS[role]?.includes(permission) ?? false;
}

export function canAny(role: RoleName | undefined | null, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

export function atLeast(role: RoleName, minimum: RoleName): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function assignableRoles(actorRole: RoleName): RoleName[] {
  if (actorRole === "OWNER") return [...ROLES];
  if (actorRole === "ADMIN") return ROLES.filter((role) => role !== "OWNER");
  return [];
}

export function isRole(value: unknown): value is RoleName {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
