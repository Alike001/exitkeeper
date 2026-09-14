"use client";

import { ArrowLeft, FileCheck2, LoaderCircle, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PreparedJob = {
  job: {
    id: string;
    reference: string;
    status: string;
    ownerAddress: string;
    chainId: number;
  };
  fingerprints: { approval: string; request: string };
};

export function WithdrawalForm() {
  const [asset, setAsset] = useState<"stETH" | "wstETH">("stETH");
  const [amount, setAmount] = useState("");
  const [job, setJob] = useState<PreparedJob | null>(null);
  const [status, setStatus] = useState<"idle" | "preparing" | "reviewing">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("preparing");
    setMessage(null);
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asset, amount }),
      });
      const body = (await response.json()) as PreparedJob & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to prepare withdrawal");
      }
      setJob(body);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to prepare withdrawal",
      );
    } finally {
      setStatus("idle");
    }
  }

  async function review() {
    if (!job) return;
    setStatus("reviewing");
    setMessage(null);
    try {
      const response = await fetch(`/api/withdrawals/${job.job.id}/review`, {
        method: "POST",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          body.error ?? "KeeperHub could not dry-run the workflows",
        );
      }
      setMessage(
        "KeeperHub created and dry-ran both exact workflows. Their audit records are now attached to this job.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to run review",
      );
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 lg:px-8 lg:py-16">
      <Link
        className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
        href="/"
      >
        <ArrowLeft className="size-4" /> Back to withdrawals
      </Link>

      <div className="mt-8">
        <Badge variant="secondary">Hoodi testnet</Badge>
        <h1 className="mt-4 font-semibold text-4xl tracking-[-0.05em]">
          Prepare a Lido exit
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground leading-7">
          ExitKeeper locks the exact amount and KeeperHub organization wallet
          into two reviewable workflows: approval first, then the withdrawal
          request.
        </p>
      </div>

      <Card className="mt-9">
        <CardHeader className="border-b">
          <CardTitle>Withdrawal details</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form className="space-y-6" onSubmit={prepare}>
            <fieldset>
              <legend className="font-medium text-sm">Asset</legend>
              <div className="mt-3 flex gap-3">
                {(["stETH", "wstETH"] as const).map((option) => (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    key={option}
                  >
                    <input
                      checked={asset === option}
                      name="asset"
                      onChange={() => setAsset(option)}
                      type="radio"
                      value={option}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="font-medium text-sm">Amount</span>
              <input
                className="mt-3 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                inputMode="decimal"
                min="0"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.01"
                required
                value={amount}
              />
              <span className="mt-2 block text-muted-foreground text-xs">
                Lido accepts 100 wei to 1,000 ETH per request. Testnet only.
              </span>
            </label>
            <Button
              disabled={status !== "idle" || Boolean(job)}
              size="lg"
              type="submit"
            >
              {status === "preparing" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <FileCheck2 />
              )}
              Prepare exact workflows
            </Button>
          </form>
        </CardContent>
      </Card>

      {job ? (
        <Card className="mt-6">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Ready for KeeperHub review</CardTitle>
              <Badge variant="outline">{job.job.reference}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-6 text-sm">
            <p className="text-muted-foreground leading-6">
              Owner is fixed to{" "}
              <span className="font-mono text-foreground">
                {job.job.ownerAddress}
              </span>
              . No recipient field exists because Lido returns claimed ETH to
              the request owner.
            </p>
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 font-mono text-xs leading-5">
              <p>Approval {job.fingerprints.approval}</p>
              <p>Request {job.fingerprints.request}</p>
            </div>
            <Button
              disabled={status !== "idle"}
              onClick={review}
              size="lg"
              type="button"
            >
              {status === "reviewing" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <PlayCircle />
              )}
              Create and dry-run in KeeperHub
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? (
        <p
          aria-live="polite"
          className="mt-5 rounded-lg border p-4 text-sm leading-6"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
