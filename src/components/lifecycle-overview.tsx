import { ArrowRight, Check, Clock3 } from "lucide-react";
import { getStagePresentation, lifecycleStages } from "@/lib/lifecycle";

const highlightedStages = new Set(["reviewed", "waiting", "returned"]);

export function LifecycleOverview() {
  return (
    <section aria-labelledby="lifecycle-title" id="evidence">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
            One durable lifecycle
          </p>
          <h2
            className="font-semibold text-2xl tracking-[-0.04em]"
            id="lifecycle-title"
          >
            Request, wait, and claim without changing the instruction.
          </h2>
        </div>
        <p className="hidden max-w-sm text-muted-foreground text-sm leading-6 lg:block">
          Wayfinder observes. KeeperHub executes. Ethereum receipts settle the
          record.
        </p>
      </div>

      <ol className="grid overflow-hidden rounded-2xl border bg-card lg:grid-cols-6">
        {lifecycleStages.map((stage, index) => {
          const presentation = getStagePresentation(stage);
          const isHighlighted = highlightedStages.has(stage);

          return (
            <li
              className="relative min-h-40 border-b p-5 last:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0"
              key={stage}
            >
              <div className="mb-8 flex items-center justify-between">
                <span
                  className={
                    isHighlighted
                      ? "flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : "flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  }
                >
                  {stage === "returned" ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : stage === "waiting" ? (
                    <Clock3 aria-hidden="true" className="size-3.5" />
                  ) : (
                    <span className="font-semibold text-[11px]">
                      {index + 1}
                    </span>
                  )}
                </span>
                {index < lifecycleStages.length - 1 ? (
                  <ArrowRight
                    aria-hidden="true"
                    className="hidden size-3.5 text-muted-foreground/50 lg:block"
                  />
                ) : null}
              </div>
              <h3 className="mb-2 font-medium text-sm">{presentation.label}</h3>
              <p className="text-muted-foreground text-xs leading-5">
                {presentation.description}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
