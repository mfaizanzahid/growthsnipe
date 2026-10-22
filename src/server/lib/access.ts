import type { OrgRole } from "../types";

/** Role hierarchy: higher number = more privilege. */
const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 0,
  user: 1,
  admin: 2,
};

export function isKnownRole(role: string): role is OrgRole {
  return role === "admin" || role === "user" || role === "viewer";
}

/** True when `actual` meets or exceeds `required` in the role hierarchy. */
export function roleAtLeast(actual: string, required: OrgRole): boolean {
  if (!isKnownRole(actual)) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** Parse SUPERADMIN_EMAILS (comma-separated) into a normalized set. */
export function parseSuperadminEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

export function isSuperadminSeedEmail(raw: string | undefined, email: string): boolean {
  return parseSuperadminEmails(raw).has(email.trim().toLowerCase());
}
