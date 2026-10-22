import { defaultAc, adminAc } from "better-auth/plugins/organization/access";
import type { AccessControl, Role } from "better-auth/plugins/access";

/**
 * Organization roles for the billing portal (verified against
 * better-auth 1.7 access-control API + installed package source).
 *
 * - admin: full org management except deleting the organization (default admin).
 * - user: no plugin-level privileges (mirrors memberAc); billing abilities
 *   (own payment methods, pay invoices) are enforced by OUR routes.
 * - viewer: read-only (mirrors memberAc); OUR routes restrict to reads.
 *
 * There is intentionally no owner role: nobody can delete an organization
 * through the plugin. Must be imported by both the server plugin and the
 * client plugin with the same access controller instance shape.
 *
 * NOTE: casts below bridge generic variance only (specialized controller vs
 * base AccessControl/Role types). Runtime objects are untouched.
 */
export const ac: AccessControl = defaultAc as unknown as AccessControl;

export const admin: Role = adminAc as unknown as Role;

const readOnly = {
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
} as const;

export const user: Role = defaultAc.newRole(readOnly) as unknown as Role;
export const viewer: Role = defaultAc.newRole(readOnly) as unknown as Role;

export const roles: Record<string, Role> = { admin, user, viewer };
