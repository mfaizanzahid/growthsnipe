import { createAuthClient } from "better-auth/react";
import { magicLinkClient, organizationClient } from "better-auth/client/plugins";
import { ac, roles } from "../../shared/permissions";

/** Same-origin client: the Worker serves both the SPA and /api/auth. */
export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), magicLinkClient()],
});

export const useSession = authClient.useSession;
