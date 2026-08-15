# Security deployment checklist

The browser files and `GAS_CORRECTED.js` must be deployed together. The secured browser client will not work against the previous unauthenticated Apps Script deployment.

## Required deployment steps

1. Replace the Apps Script project code with `GAS_CORRECTED.js` and deploy a new web-app version.
2. Confirm the `API` constant in `app.js` points to that secured deployment.
3. Serve the HTML application only over HTTPS.
4. Configure the hosting service to send these HTTP response headers (the HTML also contains a fallback meta policy):
   - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src https://script.google.com https://script.googleusercontent.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: no-referrer`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
5. Audit every teller and branch-manager account and assign a non-empty, correct Branch ID. Accounts missing a required branch are intentionally rejected.
6. Reset temporary or shared passwords. New and changed passwords require at least 12 characters; successful login upgrades older hashes to the current work factor.
7. Test each role using separate browser sessions before publishing.

## Expected security behavior

- Sessions expire after six hours of inactivity and are also invalidated by password changes or account deletion.
- Role, identity, branch, record ownership, and timestamps are resolved by the server. Values supplied by the browser are not trusted.
- The Withdrawals sheet stores display names in `ProcessedBy` (H), `CheckedBy` (I), and `ApprovedBy` (J). Stable identities are stored separately in `ProcessedByEmail` (O), `CheckedByEmail` (P), and `ApprovedByEmail` (Q). `SubmissionKey` (R) prevents duplicate request creation. Columns O-R are withheld from browser responses.
- New password hashes use a server-side pepper and a lower-latency work factor. The first successful login with a legacy hash upgrades it; later logins use the faster format. Preserve the `PASSWORD_PEPPER` Script Property when moving the Apps Script project.
- Submit, Forward, Return, Approve, and Reject actions are locked in the browser while processing. Request creation is additionally idempotent on the server, and status transitions are serialized and validated on the server.
- Request retrieval is date-scoped on the server. Missing or invalid ranges default to the current calendar month; authenticated dashboards can submit an inclusive Date From/Date To range.
- Tellers receive only their own requests; branch managers receive only their branch's requests; finance managers and administrators receive the records required for their roles.
- Administrative user/settings/signature operations require an administrator session.
- Five failed authentication attempts temporarily lock further login/password-change attempts for that account.
- Password recovery always gives the same browser response whether or not the account exists.

## Verification after deployment

- A request with no token to `getRequests`, `getUsers`, `updateStatus`, or `saveSettings` must return `UNAUTHORIZED` and no records.
- A teller token must be unable to call administrator or approval actions.
- A branch manager must be unable to view or change a request belonging to another branch.
- Replaying an old token after changing its account password must return `UNAUTHORIZED`.
- Values containing HTML or spreadsheet formula prefixes must display as text and must not execute.

## One-time historical identity migration

1. In the Apps Script editor, select and run `previewWithdrawalIdentityMigration`.
2. Inspect the returned execution result or JSON execution log. Preview mode performs no writes.
3. If the counts are reasonable, select and run `migrateWithdrawalIdentityColumns` once.
4. The migration creates a timestamped `Withdrawals Backup ...` sheet before changing data.
5. Review the timestamped `Identity Migration ...` report. Only its unresolved rows need manual review.

The migration matches exact emails first. Existing full names are linked only when they match exactly one Users-sheet account. Ambiguous or unmatched names are left unchanged.
