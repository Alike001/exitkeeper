import { ArrowRight, Fingerprint, Route, ScanSearch } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { LifecycleOverview } from "@/components/lifecycle-overview";
import { SetupPanel } from "@/components/setup-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSetupChecklist } from "@/lib/server/configuration";
import { listWithdrawalJobs } from "@/lib/server/withdrawal-jobs";
import { cn } from "@/lib/utils";
import { formatWeiAsEth } from "@/lib/withdrawals";

const guarantees = [
  {
    icon: ScanSearch,
    title: "Wayfinder observes",
    copy: "Validates the Lido position, request status, ownership, and checkpoint hints.",
  },
  {
    icon: Route,
    title: "KeeperHub executes",
    copy: "Runs only the concrete workflow you reviewed, with no inference at execution time.",
  },
  {
    icon: Fingerprint,
    title: "Every step is provable",
    copy: "Connects decisions, workflow fingerprints, execution IDs, requests, and receipts.",
  },
] as const;

export default async function Home() {
  await connection();
  const setupItems = getSetupChecklist();
  const canCreate = setupItems.every((item) => item.configured);
  const jobs = canCreate ? await listWithdrawalJobs() : [];

  return (
    <AppShell>
      <main
        className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20"
        id="withdrawals"
      >
        <section className="grid items-end gap-10 border-b pb-16 lg:grid-cols-[1.4fr_0.6fr] lg:pb-20">
          <div>
            <Badge className="mb-6" variant="secondary">
              Deterministic Lido exits
            </Badge>
            <h1 className="max-w-4xl text-balance font-semibold text-5xl leading-[0.98] tracking-[-0.06em] sm:text-6xl lg:text-7xl">
              Request. Wait. Claim. One reviewed path.
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-lg text-muted-foreground leading-8">
              ExitKeeper manages the delayed Lido withdrawal lifecycle while
              KeeperHub remains the only component allowed to move value.
            </p>
          </div>

          <div className="lg:justify-self-end">
            <Link
              aria-disabled={!canCreate}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 px-4",
                !canCreate && "pointer-events-none opacity-50",
              )}
              href={canCreate ? "/withdrawals/new" : "#connections"}
            >
              {canCreate ? "Create withdrawal" : "Complete setup to begin"}
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
            <p className="mt-3 max-w-xs text-muted-foreground text-xs leading-5">
              No wallet keys or arbitrary calldata enter the browser.
            </p>
          </div>
        </section>

        <section className="grid gap-px overflow-hidden border-x border-b bg-border lg:grid-cols-3">
          {guarantees.map((item) => (
            <div className="bg-background p-6 lg:p-8" key={item.title}>
              <item.icon
                aria-hidden="true"
                className="mb-10 size-5 text-muted-foreground"
              />
              <h2 className="font-medium">{item.title}</h2>
              <p className="mt-2 max-w-sm text-muted-foreground text-sm leading-6">
                {item.copy}
              </p>
            </div>
          ))}
        </section>

        <div className="py-16 lg:py-24">
          <LifecycleOverview />
        </div>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="min-h-80" id="withdrawals-empty">
            <CardContent className="p-7 lg:p-9">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                    Withdrawal evidence
                  </p>
                  <h2 className="mt-3 font-semibold text-2xl tracking-[-0.04em]">
                    {jobs.length === 0
                      ? "No withdrawal jobs yet."
                      : `${jobs.length} prepared job${jobs.length === 1 ? "" : "s"}.`}
                  </h2>
                </div>
                <Badge variant="outline">Hoodi</Badge>
              </div>

              {jobs.length === 0 ? (
                <p className="mt-3 max-w-md text-muted-foreground text-sm leading-6">
                  Once setup is healthy, prepare a Hoodi stETH or wstETH
                  request. Every review decision remains durable after you close
                  the browser.
                </p>
              ) : (
                <div className="mt-6 divide-y rounded-xl border">
                  {jobs.map((job) => (
                    <div
                      className="flex items-center justify-between gap-4 px-4 py-3"
                      key={job.id}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm">
                          {formatWeiAsEth(job.amountWei)} {job.asset}
                        </p>
                        <p className="mt-1 font-mono text-muted-foreground text-xs">
                          {job.reference} · {job.ownerAddress.slice(0, 8)}…
                          {job.ownerAddress.slice(-6)}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {job.status.replaceAll("-", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-7 flex items-center gap-2 text-muted-foreground text-xs">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Testnet evidence only. No mainnet claim is implied.
              </div>
            </CardContent>
          </Card>

          <SetupPanel items={setupItems} />
        </section>
      </main>
    </AppShell>
  );
}
