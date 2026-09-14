import { AppShell } from "@/components/app-shell";
import { WithdrawalForm } from "@/components/withdrawal-form";

export default function NewWithdrawalPage() {
  return (
    <AppShell>
      <main>
        <WithdrawalForm />
      </main>
    </AppShell>
  );
}
