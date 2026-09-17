# ExitKeeper

ExitKeeper is the safe exit lane for Lido staking positions.

In under 30 seconds: a user asks to withdraw stETH or wstETH; ExitKeeper turns
that request into two exact, reviewable actions — approve and request
withdrawal. KeeperHub dry-runs and executes those exact actions. Wayfinder
monitors the Lido queue until the user can claim ETH. No AI decision is made at
the moment funds move.

**Live product:** [exitkeeper.vercel.app](https://exitkeeper.vercel.app)

## Why it exists

Lido withdrawals are not a single click. A withdrawal can require token
approval, a queue request, a wait for finalization, and an owner-only claim.
That is manageable for a careful person, but unsafe for an agent that is asked
to "get my ETH out" and has to reinterpret that sentence every time it acts.

ExitKeeper separates suggestion from execution:

1. An agent or user prepares a withdrawal amount.
2. ExitKeeper fixes the owner, token, amount, chain, and contract calls into
   fingerprints that can be reviewed.
3. KeeperHub creates and dry-runs the exact approval and withdrawal workflows.
4. Only the reviewed workflows may execute; ExitKeeper rejects execution when
   a transaction node has not been simulated.
5. Wayfinder monitors finalization and ExitKeeper makes the owner-only claim
   path visible.

The result is an auditable withdrawal job, rather than an agent being trusted
with an open-ended wallet instruction.

## Integration

| System | Job in ExitKeeper |
| --- | --- |
| [Lido](https://lido.fi/) | The live withdrawal-queue protocol being integrated. |
| [KeeperHub](https://keeperhub.com/) | Creates, dry-runs, executes, retries, and audits deterministic workflows. |
| [Wayfinder](https://www.wayfinder.xyz/) | Reads the Lido account and queue state consumed by ExitKeeper. |
| ExitKeeper | Product layer that turns a withdrawal intention into a reviewed, recoverable job. |

The current test integration targets Ethereum Hoodi (chain ID `560048`) with
official Lido Hoodi stETH and wstETH. It supports approval, withdrawal request,
finalization monitoring, checkpoint hints, owner-only claims, and recovery of
uncertain KeeperHub executions.

## Testnet evidence

The self-hosted KeeperHub test organization has been funded on Hoodi with the
assets needed to execute the end-to-end Lido withdrawal:

- [0.05 Hoodi ETH gas funding](https://hoodi.etherscan.io/tx/0x3a48067011a1e1bbcf7a50b171d6eb35b52de01f4a5fb2685ec4c6c323b88c5e)
- [0.009 Hoodi stETH funding](https://hoodi.etherscan.io/tx/0x1d416828d8f905c9fbf17c3a7bdda355e452be9c46ecce6b640192a4950a617c)

These are funding transactions, not a claim that KeeperHub has already
executed the withdrawal. Hosted KeeperHub does not currently simulate Hoodi
nodes, so ExitKeeper correctly blocked the hosted execution attempt. The final
approval and withdrawal request are therefore being run through the
self-hosted Hoodi environment, where the chain and RPC are explicitly seeded.

## Demo flow

1. Open `/withdrawals/new` and select stETH or wstETH.
2. Enter the amount and prepare the exact workflows.
3. Review the fixed owner, amount, chain, call fingerprints, and job reference.
4. Create and dry-run both workflows in KeeperHub.
5. Execute approval, then the Lido withdrawal request only after simulation
   passes.
6. Show the KeeperHub audit records and the Hoodi transaction links.
7. Show Wayfinder monitoring the request until it is finalized and claimable.

The most important demo state is also a safety state: an incomplete simulation
does not become an onchain transaction.

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

For local Wayfinder calls, use the configured service token as a server-side
credential only. Do not expose it, the KeeperHub API key, or any Turnkey API
credential in browser code, screenshots, commits, or issue comments.

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

## Hackathon submission checklist

- Source: this repository
- Product: [ExitKeeper](https://exitkeeper.vercel.app)
- Integration: Lido withdrawal queue, KeeperHub deterministic workflows, and
  Wayfinder account-state monitoring
- Evidence: KeeperHub audit records plus the final Hoodi approval and
  withdrawal-request transaction links
- Demo: the seven-step flow above, including the safety gate and the recovery
  path
