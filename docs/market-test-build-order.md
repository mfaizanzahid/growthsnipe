# Market-test build order (unified app)

The merge is done: one app, one dashboard shell, one auth/org model, one Worker, one D1. Billing is a built feature; what follows builds the Sidekick surfaces, marketing pages, and remaining dashboard sections around it.

1. Marketing site + dynamic pricing: public landing, features, and `/pricing` rendered from `GET /api/plans` (active only). Signup/onboarding plan steps read the same endpoint. No hard-coded plans/prices anywhere in UI.
2. Sidekick dashboard shell sections: overview, connections, MCP access (`/mcp-access` token create/revoke), AI employees, schedules, business profile — reusing the existing auth shell, org switcher, and design system.
3. Spectora OAuth/API-key connection setup; encrypt credentials at rest.
4. Validate the Spectora upstream MCP client against the currently documented tools.
5. Load the employee playbooks into the Tradesmatic system context.
6. Build the first owner experiences: Morning Briefing, Business Snapshot, Find Anything Unusual.
7. Complete provider pagination/date windows before making KPI claims production-grade.
8. Implement public OAuth authorization for the Tradesmatic MCP (tools don't change).
9. Implement the ISN adapter once its exact API contract is selected.
10. Enable write actions only for providers that actually expose them and after audit/approval testing.
