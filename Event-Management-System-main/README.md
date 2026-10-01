
# EventFlow

EventFlow is a multi-organizer event-ticketing platform being rebuilt from the original prototype in this repository. The legacy `client/` and `server/` applications remain available as reference; the maintained application is the v2 workspace under `apps/`.

## Current architecture

- `apps/web`: Next.js App Router frontend, same-origin `/api` proxy, public discovery and attendee/organizer flows.
- `apps/api`: TypeScript Express API, PostgreSQL/Prisma domain model, opaque sessions, RBAC, event ownership, capacity-safe holds, Stripe Checkout/webhooks, ticket issuance, check-in, and PostgreSQL outbox jobs.
- Neon PostgreSQL: source of truth for users, events, inventory, orders, payments, tickets, check-ins, and jobs.
- Free deployment target: Vercel for web, Render free web service for API, Neon for database, and GitHub Actions every five minutes for the job runner.

## Start locally

1. Install Node.js 20.9+ and run `npm install` from the repository root.
2. Create `apps/api/.env` from `apps/api/.env.example`. The existing `server/.env` is still accepted by the API during migration, but Prisma CLI commands work most predictably with the v2 file in `apps/api/.env`.
3. Fill in the three generated secrets (`SESSION_SECRET`, `TICKET_TOKEN_SECRET`, `INTERNAL_JOB_TOKEN`) and the Neon database URL.
4. Apply the initial migration with `npm run db:migrate --workspace=@eventflow/api`, then seed an admin with `npm run db:seed --workspace=@eventflow/api`.
5. Start both apps with `npm run dev`.

For a disposable local PostgreSQL database, run `docker compose up -d postgres`, use `postgresql://eventflow:eventflow@localhost:5432/eventflow?schema=public` as `DATABASE_URL`, apply the migrations, and enable the database tests with `RUN_DB_TESTS=true`.

Useful checks:

```text
npm run db:generate --workspace=@eventflow/api
npm run db:validate --workspace=@eventflow/api
npm run typecheck
npm run lint
npm test --workspace=@eventflow/api
npm run build --workspace=@eventflow/web
```

The PostgreSQL concurrency and cancellation tests are opt-in locally: set `RUN_DB_TESTS=true` with a migrated test database before running the API test suite. They have been verified against the configured Neon database, and CI runs them against a disposable PostgreSQL service.

Deployment and integration steps are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The implementation phases and scope are in [PHASE_PLAN.md](PHASE_PLAN.md).
