import { requireSuperAdmin } from "@/lib/permissions";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Toaster } from "sonner";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdmin();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <p className="text-sm text-slate-600">
            Sesión: <span className="font-medium text-slate-900">{session.user.name}</span>
            <span className="ml-2 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Super admin</span>
          </p>
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
