"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "About Game",  href: "/about" },
  { label: "Contact",     href: "/contact" },
  { label: "Blockchain",  href: "/blockchain" },
  { label: "Game",        href: "/cell" },
];

export default function ProjectNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/cell" className="flex items-center gap-2 group">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950 font-black text-sm group-hover:bg-emerald-400 transition-colors">
            A
          </span>
          <span className="text-lg font-bold text-white">AgarCell</span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname === href;
            const isGame = href === "/cell";
            return (
              <Link
                key={href}
                href={href}
                className={
                  isGame
                    ? "rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
                    : isActive
                    ? "rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white"
                    : "rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white"
                }
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
