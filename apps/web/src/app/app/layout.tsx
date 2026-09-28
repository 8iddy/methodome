import { AppShell } from "@/components/ui";
import { SessionGuard } from "@/components/live";

export default function AuthenticatedLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionGuard>
      <AppShell>{children}</AppShell>
    </SessionGuard>
  );
}
