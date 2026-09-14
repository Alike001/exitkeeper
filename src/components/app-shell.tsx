import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { label: "Withdrawals", href: "#withdrawals" },
  { label: "Evidence", href: "#evidence" },
  { label: "Connections", href: "#connections" },
] as const;

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-border/70 border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link className="flex items-center gap-3" href="/">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <span className="font-semibold tracking-[-0.02em]">ExitKeeper</span>
          </Link>

          <nav
            aria-label="Primary"
            className="hidden items-center gap-7 md:flex"
          >
            {navItems.map((item) => (
              <Link
                className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Badge variant="outline">Ethereum Hoodi testnet</Badge>
        </div>
      </header>
      {children}
    </div>
  );
}
