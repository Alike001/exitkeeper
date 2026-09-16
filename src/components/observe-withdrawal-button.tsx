"use client";

import { LoaderCircle, ScanSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ObserveWithdrawalButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function observe() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/withdrawals/${jobId}/observe`, {
        method: "POST",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Wayfinder could not refresh this job");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Wayfinder could not refresh this job",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button disabled={pending} onClick={observe} type="button">
        {pending ? <LoaderCircle className="animate-spin" /> : <ScanSearch />}
        Refresh Wayfinder evidence
      </Button>
      {error ? (
        <p aria-live="polite" className="mt-3 text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
