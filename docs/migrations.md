# Database Migrations

Armin stores every User's study data in a single shared Postgres database. The
app upgrades that database by running the SQL files in `drizzle/` with Drizzle's
Postgres migrator.

## Authority And Pipeline

Drizzle is the only authority for the application schema in `public`:

```text
src/db/schema.ts
  -> bun run db:generate --name=<descriptive_snake_case_name>
  -> drizzle/*.sql + drizzle/meta/*
  -> bun run db:migrate
  -> Supabase Postgres public schema
```

Supabase provides Postgres and owns its platform schemas, including `auth`,
`storage`, and `realtime`. The Supabase CLI provisions those schemas locally but
does not migrate Armin's `public` schema. Consequently:

- `supabase/config.toml` disables Supabase migrations and seed SQL
- there are no application migrations under `supabase/migrations/`
- `drizzle.__drizzle_migrations` is the application migration ledger
- never use `supabase db push`, `supabase migration new`, or `drizzle-kit push`
  for application schema changes
- never make application schema changes in Supabase Studio or with ad hoc SQL

This separation prevents two tools from recording incompatible versions of the
same schema.

## Connections

The running application reads `DATABASE_URL`. Migrations prefer
`DATABASE_MIGRATION_URL` and fall back to `DATABASE_URL` for local compatibility.
Hosted environments should set `DATABASE_MIGRATION_URL` to Supabase's direct
connection, or its session pooler when direct IPv6 connectivity is unavailable.
Do not run DDL through the transaction pooler.

Local commands use the fixed Supabase CLI database at
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, so they cannot
accidentally migrate a linked or production database.

## Commands

- `bun run db:generate --name=<name>` generates SQL and Drizzle metadata from
  `src/db/schema.ts`.
- `bun run db:check` validates the migration journal and snapshots.
- `bun run db:migrate` applies pending migrations to
  `DATABASE_MIGRATION_URL`, falling back to `DATABASE_URL`.
- `bun run db:local:migrate` applies pending migrations only to local Supabase.
- `bun run db:local:reset` destroys and recreates local Supabase, including
  local Auth users, then applies every committed Drizzle migration from zero.

## Workflow

1. Update the current schema in `src/db/schema.ts`.
2. Generate a descriptively named migration for schema changes:
   `bun run db:generate --name=<descriptive_snake_case_name>`.
3. Review the generated SQL before committing it.
4. Commit Drizzle's generated snapshot and journal changes with the SQL whenever
   `drizzle-kit generate` creates them.
5. Do not hand-edit or hand-author SQL unless the upgrade semantics require it:
   data backfills, table renames, or preserving user history that generated DDL
   would lose.
6. Discuss the reason before manually changing migration SQL. After agreement,
   generate a custom migration when appropriate and keep the hand-written SQL
   limited to the behavior Drizzle cannot safely infer.
7. Run `bun run db:check` and `bun run db:local:reset` to prove the complete
   migration history builds a fresh Supabase database. The reset is destructive
   and is only for the local Supabase instance.
8. Manually verify hand-authored or materially hand-edited migrations against a
   temporary old-shape database before release.
9. Run `bun run typecheck`, `bun run lint`, and `bun run test`.

Apply pending migrations to an existing shared environment with
`bun run db:migrate`. Run that command once as a deployment migration job before
starting the new application version, not from every application process.

Agents must use Drizzle-generated migrations for ordinary schema changes. Manual
SQL is an exception for cases Drizzle cannot express safely; discuss that reason
before editing generated SQL or adding a custom migration. Record the manual
verification performed in the PR or issue instead of adding a one-off migration
regression test by default.

## Release Boundary

Once a migration may be someone else's durable upgrade path, do not rewrite it.
Add a new migration that carries the fix forward.

The local database is disposable and may be repaired with
`bun run db:local:reset`. Shared development, preview, and production databases
are durable: never reset them and never edit their migration ledger manually.

## Drizzle Metadata

Runtime migration depends on the SQL files and `drizzle/meta/_journal.json`; keep
Drizzle's generated snapshot metadata and journal changes with each generated SQL
file. If a future migration is fully manual, update the journal and SQL
deliberately rather than pretending the migration was generated.

Do not rename a generated migration, change its journal timestamp, or regenerate
an existing migration after it has crossed the release boundary. Those changes
make Drizzle treat an already-applied migration as different history.

## Naming

Migration names should always describe the schema or data change. Use snake_case
names, not generated fantasy names. Agents must pass `--name` when running
`bun run db:generate`, for example:

```bash
bun run db:generate --name=add_deck_scheduling_overrides
```

For custom manual migrations, use Drizzle's custom migration generation with a
descriptive name:

```bash
bun run db:generate -- --custom --name=backfill_flashcard_content
```

## Verifying Manual Migrations

Manual and materially edited migrations should be checked with an ephemeral
old-shape database. The verification should:

- create a temporary Postgres database
- create the old schema shape directly
- seed data that exercises the upgrade behavior
- apply the migration SQL
- inspect that data, relationships, and history were preserved as intended
- delete the temporary database afterward

Do not keep these checks as permanent tests unless the migration encodes a
long-lived core service invariant rather than a one-time upgrade path.
