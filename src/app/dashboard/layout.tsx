import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { AuthGuard } from "@/components/dashboard/auth-guard";
import { KybGate } from "@/components/dashboard/kyb-gate";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {/* clip, not hidden: hidden would make this a scroll container and stop
          the sidebar and topbar from sticking. */}
      <div className="flex min-h-screen w-full overflow-x-clip">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="page-enter flex-1 px-[var(--space-gutter)] pt-[var(--space-section)] pb-12 max-w-[1400px] mx-auto w-full min-w-0">
            <KybGate />
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
