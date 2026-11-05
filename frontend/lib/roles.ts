/**
 * The roles an access token can carry.
 *
 * Mirrors `backend/shared/enums/roles.enum.ts`: the gateway takes the role from
 * the JWT, so the UI has to use the same strings, not a friendlier copy.
 */
export const ROLES = ["EMPLOYEE", "ADMIN", "MASTER_ADMIN"] as const;

export type Role = (typeof ROLES)[number];

const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employee",
  ADMIN: "HR Admin",
  MASTER_ADMIN: "Master admin",
};

/** Reads "HR Admin" where the API says `ADMIN`. */
export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

/** True for the roles that may open the dashboard and read other employees. */
export function isAdminRole(role: Role | null | undefined): boolean {
  return role === "ADMIN" || role === "MASTER_ADMIN";
}

/** True for the one role the API lets assign roles and delete employees. */
export function isMasterAdmin(role: Role | null | undefined): boolean {
  return role === "MASTER_ADMIN";
}

/** A stored role is only trusted when it is one the API knows. */
export function parseRole(value: unknown): Role {
  return ROLES.includes(value as Role) ? (value as Role) : "EMPLOYEE";
}
