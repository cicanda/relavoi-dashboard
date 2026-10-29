import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { AuthGuard } from "@/components/dashboard/auth-guard";
import { KybGate } from "@/components/dashboard/kyb-gate";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen w-full overflow-x-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 px-4 sm:px-6 py-5 sm:py-6 max-w-[1400px] mx-auto w-full min-w-0">
            <KybGate />
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
