import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldForceOnboarding } from "../src/react-app/lib/onboarding-gate";

/**
 * Regression guard for the superadmin redirect loop.
 *
 * A superadmin has no workspace by design (they are platform operators and
 * cannot create one). The app shell therefore sees "no workspace" and used to
 * bounce the user into the onboarding wizard, while the wizard bounced them
 * back to the admin console - an endless loop.
 *
 * The signal that separates "needs onboarding" from "is a superadmin" is the
 * profile probe (GET /api/me), which carries the superadmin flag. The
 * redirect must not fire until that probe has settled.
 */
describe("superadmin onboarding redirect", () => {
  it("does not redirect while the superadmin flag is still unknown", () => {
    // The exact race that caused the loop: the profile probe is still in
    // flight, so superadmin reads false even though the user is one.
    expect(
      shouldForceOnboarding({
        loading: true,
        superadmin: false,
        onOnboardingRoute: false,
        orgCount: 0,
      }),
    ).toBe(false);
  });

  it("never redirects a superadmin to onboarding", () => {
    expect(
      shouldForceOnboarding({
        loading: false,
        superadmin: true,
        onOnboardingRoute: false,
        orgCount: 0,
      }),
    ).toBe(false);
  });

  it("sends a fresh user with no workspace to onboarding", () => {
    expect(
      shouldForceOnboarding({
        loading: false,
        superadmin: false,
        onOnboardingRoute: false,
        orgCount: 0,
      }),
    ).toBe(true);
  });

  it("leaves a user who already has a workspace alone", () => {
    expect(
      shouldForceOnboarding({
        loading: false,
        superadmin: false,
        onOnboardingRoute: false,
        orgCount: 1,
      }),
    ).toBe(false);
  });

  it("does not redirect away from the wizard itself", () => {
    expect(
      shouldForceOnboarding({
        loading: false,
        superadmin: false,
        onOnboardingRoute: true,
        orgCount: 0,
      }),
    ).toBe(false);
  });

  it("wires the app shell to the shared gate", () => {
    const shell = readFileSync(
      join(process.cwd(), "src/react-app/components/shell/AppShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("shouldForceOnboarding({");
    expect(shell).not.toMatch(/!loading && !superadmin && !onOnboardingRoute/);
  });

  it("waits for the profile probe before reporting loading as done", () => {
    const hook = readFileSync(
      join(process.cwd(), "src/react-app/hooks/useActiveOrg.ts"),
      "utf8",
    );
    // The superadmin flag comes from the profile probe, so the probe has to
    // be part of the loading gate.
    expect(hook).toMatch(/loading:[^;]*!meLoaded/);
    // The probe must set the flag when it settles (success or failure),
    // otherwise loading would never end.
    expect(hook).toMatch(/finally\s*\{\s*setMeLoaded\(true\)/);
  });
});
