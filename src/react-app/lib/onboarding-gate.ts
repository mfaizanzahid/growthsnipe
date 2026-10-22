export interface OnboardingGateInput {
  /** True while the session, workspace list, or profile probe is still loading. */
  loading: boolean;
  /** Platform operator flag, read from GET /api/me. */
  superadmin: boolean;
  /** Already on the wizard (or accepting an invitation). */
  onOnboardingRoute: boolean;
  /** Number of workspaces the user belongs to. */
  orgCount: number;
}

/**
 * Whether a user without a workspace must be pushed into the onboarding
 * wizard.
 *
 * The superadmin exemption is the important part: a superadmin has no
 * workspace by design (they are platform operators and cannot create one),
 * so "no workspace" would otherwise send them into the wizard, while the
 * wizard sends them back to the admin console - an endless loop.
 *
 * `loading` must cover the profile probe that carries the superadmin flag.
 * While that probe is in flight the flag is not yet known, so "no workspace"
 * is not actionable and the redirect must wait.
 */
export function shouldForceOnboarding(input: OnboardingGateInput): boolean {
  if (input.loading) return false;
  if (input.superadmin) return false;
  if (input.onOnboardingRoute) return false;
  return input.orgCount === 0;
}
