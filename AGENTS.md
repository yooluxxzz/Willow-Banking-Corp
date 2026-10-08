# Repository work history

At the user's request, keep a Git record of every completed development work session.

- Update WORK_LOG.md with the implemented behavior, database/schema changes, and checks run.
- Commit the completed changes locally with a concrete message. Keep unrelated user changes out of the commit.
- Include database schema, migrations and tests in version control.
- `npm run db:save` writes a private local backup at `data/willow-snapshot.sql`. Do not commit raw snapshots, customer data or credential hashes. Only sanitized synthetic fixtures belong in source control.
- Keep the live database file, session stores, backup files, plaintext passwords or recovery codes, and environment secrets ignored.
- Do not push or publish unless the user explicitly authorizes it.
