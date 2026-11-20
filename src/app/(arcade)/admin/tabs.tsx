"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminTabs({ pendingCount }: { pendingCount: number }) {
  const path = usePathname();
  const tabs = [
    { href: "/admin", label: "🎮 Games", active: path === "/admin" || path.startsWith("/admin/games") },
    { href: "/admin/approvals", label: "✅ Approvals", active: path.startsWith("/admin/approvals"), badge: pendingCount },
    { href: "/admin/people", label: "👨‍👩‍👧 People", active: path.startsWith("/admin/people") },
  ];
  return (
    <nav className="flex flex-wrap gap-2 rounded-2xl border-[3px] border-ink bg-white p-1.5 shadow-pop-sm">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`relative rounded-xl px-4 py-1.5 font-display font-semibold transition ${
            t.active ? "bg-grape text-white" : "hover:bg-cream"
          }`}
        >
          {t.label}
          {t.badge ? (
            <span className="absolute -top-2 -right-2 grid h-6 min-w-6 place-items-center rounded-full border-2 border-ink bg-berry px-1 text-xs text-white">
              {t.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
