import { CheckCircle2, CircleDashed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SetupItem } from "@/lib/server/configuration";

type SetupPanelProps = {
  items: SetupItem[];
};

export function SetupPanel({ items }: SetupPanelProps) {
  const configuredCount = items.filter((item) => item.configured).length;

  return (
    <Card className="h-full" id="connections">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Execution setup</CardTitle>
          <span className="font-mono text-muted-foreground text-xs">
            {configuredCount}/{items.length} configured
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-3">
        {items.map((item) => (
          <div
            className="flex items-start gap-3 rounded-xl px-2 py-3"
            key={item.id}
          >
            {item.configured ? (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-4 text-emerald-700"
              />
            ) : (
              <CircleDashed
                aria-hidden="true"
                className="mt-0.5 size-4 text-muted-foreground"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-sm">{item.label}</p>
                <span className="text-muted-foreground text-xs">
                  {item.configured ? "Configured" : "Required"}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
