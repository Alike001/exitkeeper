import { ArrowLeft, Fingerprint, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ObserveWithdrawalButton } from "@/components/observe-withdrawal-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWithdrawalJobEvidence } from "@/lib/server/withdrawal-jobs";
import { formatWeiAsEth } from "@/lib/withdrawals";

function dateTime(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(value);
}

export default async function WithdrawalEvidencePage({
  params,
}: PageProps<"/withdrawals/[jobId]">) {
  const { jobId } = await params;
  const evidence = await getWithdrawalJobEvidence(jobId);
  if (!evidence) notFound();

  const snapshot = evidence.snapshots[0];
  const decision = snapshot?.decision as Record<string, unknown> | undefined;
  const canObserve = [
    "request-confirmed",
    "waiting-finalization",
    "claimable",
  ].includes(evidence.job.status);

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
        <Link
          className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
          href="/"
        >
          <ArrowLeft className="size-4" /> All withdrawals
        </Link>

        <div className="mt-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <Badge variant="secondary">Hoodi testnet evidence</Badge>
            <h1 className="mt-4 font-semibold text-4xl tracking-[-0.05em]">
              {evidence.job.reference}
            </h1>
            <p className="mt-3 text-muted-foreground leading-7">
              {formatWeiAsEth(evidence.job.amountWei)} {evidence.job.asset} ·
              fixed Lido withdrawal owner
            </p>
          </div>
          <Badge variant="outline">
            {evidence.job.status.replaceAll("-", " ")}
          </Badge>
        </div>

        {canObserve ? (
          <div className="mt-6">
            <ObserveWithdrawalButton jobId={evidence.job.id} />
          </div>
        ) : null}

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Execution boundary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6 text-sm">
              <p className="text-muted-foreground">
                KeeperHub organization wallet
              </p>
              <p className="break-all font-mono text-xs">
                {evidence.job.ownerAddress}
              </p>
              <p className="pt-2 text-muted-foreground">Network</p>
              <p>Ethereum Hoodi · chain {evidence.job.chainId}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Safety invariants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground leading-6">
              <p>No browser wallet key.</p>
              <p>No arbitrary recipient field.</p>
              <p>No inferred transaction at execution time.</p>
            </CardContent>
          </Card>
        </section>

        <Card className="mt-6">
          <CardHeader className="border-b">
            <CardTitle>Reviewed workflow fingerprints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6 text-sm">
            <div className="flex gap-3">
              <Fingerprint className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Request workflow</p>
                <p className="mt-1 break-all font-mono text-muted-foreground text-xs">
                  {snapshot?.workflowFingerprint ?? "Not recorded"}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Fingerprint className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Approval workflow</p>
                <p className="mt-1 break-all font-mono text-muted-foreground text-xs">
                  {typeof decision?.approvalFingerprint === "string"
                    ? decision.approvalFingerprint
                    : "Not recorded"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader className="border-b">
            <CardTitle>KeeperHub execution records</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {evidence.executions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No workflow was accepted by KeeperHub yet. The hosted
                environment must support Hoodi before the reviewed workflows can
                be dry-run.
              </p>
            ) : (
              <div className="space-y-4">
                {evidence.executions.map((execution) => (
                  <div
                    className="flex items-start justify-between gap-4 rounded-lg border p-4"
                    key={execution.id}
                  >
                    <div>
                      <p className="font-medium capitalize">
                        {execution.stage}
                      </p>
                      <p className="mt-1 font-mono text-muted-foreground text-xs">
                        {execution.workflowId}
                      </p>
                      {execution.transactionHashes.map((hash) => (
                        <a
                          className="mt-2 block font-mono text-xs underline underline-offset-4"
                          href={`https://hoodi.etherscan.io/tx/${hash}`}
                          key={hash}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {hash.slice(0, 12)}…{hash.slice(-10)}
                        </a>
                      ))}
                    </div>
                    <Badge variant="outline">{execution.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader className="border-b">
            <CardTitle>Append-only lifecycle</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <ol className="space-y-5">
              {evidence.events.map((event) => (
                <li className="flex gap-3" key={event.id}>
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-sm">{event.summary}</p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {event.source} · {dateTime(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
