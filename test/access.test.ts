import { describe, expect, it } from "vitest";
import {
  isKnownRole,
  isSuperadminSeedEmail,
  parseSuperadminEmails,
  roleAtLeast,
} from "../src/server/lib/access";

describe("role hierarchy", () => {
  it("admin outranks user outranks viewer", () => {
    expect(roleAtLeast("admin", "admin")).toBe(true);
    expect(roleAtLeast("admin", "user")).toBe(true);
    expect(roleAtLeast("admin", "viewer")).toBe(true);
    expect(roleAtLeast("user", "admin")).toBe(false);
    expect(roleAtLeast("user", "user")).toBe(true);
    expect(roleAtLeast("user", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "user")).toBe(false);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
  });

  it("unknown roles never authorize", () => {
    expect(roleAtLeast("owner", "viewer")).toBe(false);
    expect(roleAtLeast("", "viewer")).toBe(false);
    expect(isKnownRole("owner")).toBe(false);
    expect(isKnownRole("admin")).toBe(true);
  });
});

describe("superadmin seed emails", () => {
  it("parses comma-separated emails case-insensitively", () => {
    const set = parseSuperadminEmails("Boss@Example.com, ops@example.com ,,");
    expect(set.has("boss@example.com")).toBe(true);
    expect(set.has("ops@example.com")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("matches seed emails regardless of case", () => {
    expect(isSuperadminSeedEmail("admin@x.com", "Admin@X.com")).toBe(true);
    expect(isSuperadminSeedEmail("admin@x.com", "user@x.com")).toBe(false);
    expect(isSuperadminSeedEmail(undefined, "admin@x.com")).toBe(false);
  });
});
