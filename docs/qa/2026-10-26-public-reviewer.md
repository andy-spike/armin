# Public reviewer account walkthrough

2026-10-26, isolated T3 worktree local Convex deployment and headless Chromium via agent-browser. A locally created verified reviewer used the published disposable login; no production data was changed.

- Signed in and saw the shared-data notice. The existing sample library was visible.
- Forced an operator reset. The existing session remained usable and the replacement sample deck appeared with four cards and three due review units. A subsequent unforced reset returned `not_due`.
- Account settings disabled password reset, signing out other sessions, and deletion. Direct authenticated requests to update the user, change password, delete the user, revoke other sessions, and request a password reset returned `403 REVIEWER_ACCOUNT_PROTECTED`.
- With the local reviewer ID unset, reset returned `disabled`; an invalid ID failed without erasing data. Restored the local configuration afterward.

This walkthrough did not exercise an actual six-hour wait, a multi-batch library, OAuth grant retention, or a physical mobile device. Production reset and protections require deployment and configuration.
