# OpenCode agent usage

Project-local agents live in `.opencode/agents/`.

Current agents:
- `orchestrator`
- `implementation-planner`
- `billing-specialist`
- `portal-frontend`
- `safepay-specialist`
- `cloudflare-specialist`
- `test-engineer`
- `security-reviewer`

OpenCode discovers project agents from `.opencode/agents/`.

Suggested prompts:

```text
@implementation-planner audit the current scaffold against AGENTS.md and produce the Phase 1-3 implementation matrix.

@billing-specialist implement plans, coupons, proration, dunning, and invoice numbering rules.

@portal-frontend build the SaaS shell, onboarding wizard, and billing screens.

@safepay-specialist implement wallet sync, unscheduled_cof charging, refunds, and webhook verification in the generic adapter.

@cloudflare-specialist make the project fully runnable on Workers + D1 + Drizzle.

@test-engineer implement the missing billing contract tests (signup, Cron renewals, usage charges, idempotency).

@security-reviewer audit the completed billing implementation.
```

The Cloudflare Docs MCP is preconfigured in `opencode.jsonc`.
