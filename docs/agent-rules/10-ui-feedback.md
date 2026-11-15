# UI action feedback

Every control that starts async work must show immediate feedback. A click must never do nothing while the request is in flight.

## Rules

- **Buttons:** set `loading` and `loadingText` on the shared `Button`, or set `disabled` plus a label change and a `Spinner`. Never leave the control enabled while the request runs.
- **Row actions:** pass `loading` and/or `disabled` to `RowAction` for async icon actions.
- **Page-level work:** when the whole view is loading, a skeleton or a `role="status"` indicator is acceptable instead of per-button feedback.
- **Single flight:** a mutation must prevent double submits. Disable the initiating control until the request and any dependent refresh settle. Per-row actions use a keyed pending id, not one global boolean.
- **Accessibility:** set `aria-busy` on the pending control. Keep `aria-label` accurate.
- **Toasts do not replace feedback:** success and error toasts complement the pending state.
- **Exempt:** pure navigation links (`asChild` with `Link` or `a`) and synchronous client-side toggles need no pending state. Downloads follow the browser.

## Implementation

- `src/react-app/components/ui/spinner.tsx` exports `Spinner`.
- `Button` accepts `loading?: boolean` and `loadingText?: React.ReactNode`.
- `RowAction` accepts `disabled?: boolean` and `loading?: boolean`.
- Existing idiom: `disabled={pendingId === id}` plus `loadingText="Saving…"`.
- For keyed helpers such as `run(fn, ok, key)`, key by action and row (`features:${id}`) and clear the key in `finally`.

## Required verification

- Manually click every changed control and confirm it disables and shows progress.
- Test with network throttling to confirm the pending state is visible and double submits are blocked.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

Applies to every dashboard and superadmin surface, including any dormant page that is re-enabled later.
