# Fractional riel release hold

The code is ready for main, but automatic Vercel Git deployments are temporarily
disabled in vercel.json. This preserves the current production application until
the coordinated database migration can be performed. It does not pause or change
the running production deployment.

The release check on 2026-10-13 found that the connected Supabase account cannot
access the configured project, SUPABASE_DB_URL is empty, and both the Vercel
connector and CLI cannot access the production team sb-6cac. GitHub access works.
No hosted database data or schema has been changed.

The flag follows [Vercel's documented Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
It disables automatic deployments for all branches, including main; do not
remove it until the matching database and application release is ready.

To resume, connect the production accounts, verify a restorable backup and the
first 13 hosted migrations, prepare the matching deployment, and follow the
[coordinated migration procedure](FRACTIONAL_RIEL_MIGRATION.md). Keep web and bot
writes paused during the change. After verifying precision version 2 and bank
balance reconciliation, resume writes and remove the Git deployment hold.

Credentials belong in the authenticated connector or local environment, never
in this document or chat.
