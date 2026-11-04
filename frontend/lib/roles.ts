export const ROLES = ["EMPLOYEE", "ADMIN", "MASTER_ADMIN"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employee",
  ADMIN: "Admin",
  MASTER_ADMIN: "Master Admin",
};

export function roleLabel(role: Role | null | undefined): string {
  return role ? ROLE_LABELS[role] : "Employee";
}

/** Admin screens are available to ADMIN and MASTER_ADMIN. */
export function isAdminRole(role: Role | null | undefined): boolean {
  return role === "ADMIN" || role === "MASTER_ADMIN";
}

export function isMasterAdmin(role: Role | null | undefined): boolean {
  return role === "MASTER_ADMIN";
}
