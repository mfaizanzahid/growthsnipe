# Auth & email

- Better Auth with email+password, Google OAuth, and magic link (via Resend). Sessions are D1-backed.
- Never expose auth secrets, session tokens, or Resend keys to the client bundle.
- Org membership is resolved server-side from the session on every request; never trust a client-supplied role.
- Resend sends: signup charge receipt, renewal success/failure, invoice created/paid/failed, payment method updated, subscription canceled.
- All email sends are mocked in tests. No real sends in CI.
