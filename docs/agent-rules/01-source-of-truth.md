# Source of truth

Use vendor documentation before writing integration code. Preserved local contracts are authoritative for Safepay:

- `docs/safepay-api-contract.md` (verified HTTP contracts)
- `docs/safepay-atoms.md` (card capture / payer-auth UI)

Never "complete" an API shape from memory. Never invent Safepay, Better Auth, or Resend fields, signatures, or paths.

When documentation is ambiguous:
1. Find the exact endpoint or contract.
2. Record the uncertainty in `docs/decision-log.md`.
3. Implement the narrowest verified behavior.
4. Add a TODO/test that prevents silent assumptions.
