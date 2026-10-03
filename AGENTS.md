# Repository work history

At the user's request, keep a Git record of every completed development work session.

- Update WORK_LOG.md with the implemented behavior, database/schema changes, and checks run.
- Commit the completed changes locally with a concrete message. Keep unrelated user changes out of the commit.
- Include database schema, migrations and tests in version control.
- At the user's request, database contents are versioned as a SQL snapshot: `npm run db:save` writes `data/willow-snapshot.sql`, which may be committed. It holds hashed passwords and recovery codes and everything users enter, so the repository must stay private.
- Keep the live database file, session stores, backup files, plaintext passwords or recovery codes, and environment secrets ignored.
- Do not push or publish unless the user explicitly authorizes it.
