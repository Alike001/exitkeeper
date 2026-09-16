"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RecoverExecutionButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recover() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/withdrawals/${jobId}/recover`, {
        method: "POST",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "KeeperHub recovery failed");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "KeeperHub recovery failed",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        disabled={pending}
        onClick={recover}
        type="button"
        variant="outline"
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        Recover KeeperHub execution
      </Button>
      {error ? (
        <p aria-live="polite" className="mt-3 text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
