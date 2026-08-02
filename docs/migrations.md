# Database Migrations

Armin stores every User's study data in a single shared Postgres database. The
app upgrades that database by running the SQL files in `drizzle/` with Drizzle's
Postgres migrator.

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
7. Manually verify hand-authored or materially hand-edited migrations against a
   temporary old-shape database before release.
8. Run `bun run typecheck`, `bun run lint`, and `bun run test`.

Agents must use Drizzle-generated migrations for ordinary schema changes. Manual
SQL is an exception for cases Drizzle cannot express safely; discuss that reason
before editing generated SQL or adding a custom migration. Record the manual
verification performed in the PR or issue instead of adding a one-off migration
regression test by default.

## Release Boundary

Once a migration may be someone else's durable upgrade path, do not rewrite it.
Add a new migration that carries the fix forward.

## Drizzle Metadata

Runtime migration depends on the SQL files and `drizzle/meta/_journal.json`; keep
Drizzle's generated snapshot metadata and journal changes with each generated SQL
file. If a future migration is fully manual, update the journal and SQL
deliberately rather than pretending the migration was generated.

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
