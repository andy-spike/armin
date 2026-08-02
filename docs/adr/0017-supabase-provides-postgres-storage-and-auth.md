# Supabase provides Postgres, object storage, and auth

Armin relies on **Supabase** for three managed capabilities: the Postgres
database, object storage for flashcard media, and user authentication. This
supersedes the earlier plan of Neon (managed Postgres), Vercel Blob (media), and
Better Auth. Vercel still hosts the Next.js app; Polar.sh still handles payments;
OpenRouter + Mastra still power the AI features.

Supabase is a single vendor covering the data, storage, and auth needs of the
rebuild, so the team can lean on its managed capabilities instead of running and
integrating three separate services.

Consequences: the app talks to Supabase's Postgres through `pg` + drizzle as
before (the data-layer decision is unchanged), while auth goes through Supabase
Auth's SSR client (`@supabase/ssr`) and media through Supabase Storage signed
URLs on a private bucket. The `auth` schema is managed by Supabase and is never
migrated; study rows stay scoped by `userId` referencing `auth.users.id`. A
future move away from Supabase would touch the auth/session plumbing, the media
store, and connection strings, but the domain services and their ADR contracts
are unaffected.
