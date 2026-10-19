# Google sign-in uses Better Auth with D1

Google sign-in and sessions use Better Auth running in our Cloudflare Worker,
with authentication data stored in D1. This replaces the managed external
authentication-provider proposal while keeping the beta's Google-only open
registration. Sync ownership is derived from the authenticated identity, not
from caller-supplied Account identifiers.

Use Better Auth's native D1 support and session lookup. Its `user` identity maps
to an Armin Account; its `account` table stores a linked login method. No external
provider JWT verifier is needed.
