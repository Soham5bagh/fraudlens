"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Review queue" },
  { href: "/demo", label: "Guided demo" },
  { href: "/investigate", label: "Investigate live" },
  { href: "/metrics", label: "Results" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <strong>Halden</strong>
          <span>A fraud analyst that waits for you</span>
        </Link>
        <nav className="nav">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={active ? "active" : undefined}>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
