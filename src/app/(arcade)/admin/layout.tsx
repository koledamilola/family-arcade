import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminTabs } from "./tabs";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const supabase = await createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "pending");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="mr-auto text-3xl font-bold sm:text-4xl">🛠️ Admin</h1>
        <AdminTabs pendingCount={count ?? 0} />
      </div>
      {children}
    </main>
  );
}
