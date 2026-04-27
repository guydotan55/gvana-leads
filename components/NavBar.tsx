"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { clientConfig } from "@/client.config";
import { t } from "@/lib/i18n";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/", label: t("nav.dashboard") },
    { href: "/forms", label: t("nav.forms") },
    { href: "/templates", label: t("nav.templates") },
    { href: "/settings", label: t("nav.settings") },
  ];

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="bg-brand-navy text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            {clientConfig.logo && (
              <Image
                src={clientConfig.logo}
                alt={clientConfig.name}
                width={36}
                height={36}
                className="rounded"
              />
            )}
            <span className="font-bold text-lg">{clientConfig.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors ms-2"
            >
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
