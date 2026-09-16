"use client";

import { FileCheck2, LoaderCircle, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ClaimControls({
  jobId,
  reviewed,
}: {
  jobId: string;
  reviewed: boolean;
}) {
  const router = useRouter();
  const [claimReviewed, setClaimReviewed] = useState(reviewed);
  const [pending, setPending] = useState<"review" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: "review" | "execute") {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(
        `/api/withdrawals/${jobId}/claim/${action}`,
        {
          method: "POST",
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? `Unable to ${action} claim`);
      if (action === "review") setClaimReviewed(true);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : `Unable to ${action} claim`,
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {!claimReviewed ? (
        <Button
          disabled={pending !== null}
          onClick={() => submit("review")}
          type="button"
        >
          {pending === "review" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <FileCheck2 />
          )}
          Create and dry-run claim
        </Button>
      ) : (
        <Button
          disabled={pending !== null}
          onClick={() => submit("execute")}
          type="button"
          variant="destructive"
        >
          {pending === "execute" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <PlayCircle />
          )}
          Execute reviewed claim
        </Button>
      )}
      {error ? (
        <p aria-live="polite" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
