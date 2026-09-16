# ExitKeeper

ExitKeeper safely automates delayed Lido withdrawals. Wayfinder observes the
withdrawal queue, KeeperHub executes only reviewed workflows, and ExitKeeper
preserves the fingerprints, decisions, receipts, and transaction history.

The current integration targets Ethereum Hoodi (chain ID `560048`). It supports
stETH and wstETH approval, withdrawal requests, finalization monitoring,
checkpoint hints, owner-only claims, and recovery of uncertain KeeperHub
executions.

## Local development

Copy `.env.example` to `.env` and provide a KeeperHub organization API key and a
long random Wayfinder service token. Then start the dependencies and app:

```bash
docker compose up -d postgres wayfinder
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. The readiness endpoint is `GET /api/health`; the
container liveness endpoint is `GET /api/live`.

## Production container

Build and run the complete production profile with:

```bash
docker compose --profile production up --build
```

The migration service completes before the application starts. For a managed
platform, run the Dockerfile `migrate` target as the release command and deploy
the default `runner` target as the web service. Supply all variables from
`.env.example` at runtime. Never place the KeeperHub API key in a public or
`NEXT_PUBLIC_` variable.

## Verification

Run the complete repository verification before deployment:

```bash
pnpm verify
```
