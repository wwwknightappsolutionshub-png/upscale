export const ADMIN_ROLES = ["super_admin", "admin", "editor"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  editor: "Editor",
};

export function normalizeAdminRole(raw: string | null | undefined): AdminRole {
  if (raw === "super_admin" || raw === "admin" || raw === "editor") return raw;
  return "super_admin";
}

export function canManageEmailTemplates(role: AdminRole) {
  return role === "super_admin";
}

export function canManageTeam(role: AdminRole) {
  return role === "super_admin";
}

export function canManageSiteContent(role: AdminRole) {
  return role === "super_admin" || role === "admin";
}

export function canEditInstructors(role: AdminRole) {
  return role === "super_admin" || role === "admin" || role === "editor";
}

export function canReviewEvidence(role: AdminRole) {
  return role === "super_admin" || role === "admin" || role === "editor";
}

export function canViewAudit(role: AdminRole) {
  return role === "super_admin" || role === "admin";
}

export function navAllowed(href: string, role: AdminRole) {
  if (href === "/admin/emails") return canManageEmailTemplates(role);
  if (href === "/admin/team") return canManageTeam(role);
  if (href === "/admin/courses" || href === "/admin/cohorts" || href === "/admin/landing") {
    return canManageSiteContent(role);
  }
  if (href === "/admin/audit") return canViewAudit(role);
  return true;
}
