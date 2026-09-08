"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { brandConfig } from "@/lib/brand";

interface AppShellProps {
  userEmail: string;
  children: ReactNode;
}

interface NavigationItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
}

const navigationItems: NavigationItem[] = [
  { href: "/app", label: "Overview", icon: "⌂", exact: true },
  { href: "/app/archive", label: "Archive", icon: "□" },
  { href: "/app/personas", label: "Personas", icon: "◎" },
  { href: "/app/reports", label: "Reports", icon: "▤" },
  { href: "/app/settings", label: "Settings", icon: "⚙" },
];

function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon,
  exact,
  compact = false,
}: NavigationItem & { compact?: boolean }) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href, exact);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group inline-flex items-center gap-2 rounded-lg font-semibold transition-[background-color,color,box-shadow] duration-150 motion-reduce:transition-none focus-visible:relative focus-visible:z-10 ${
        compact ? "px-3 py-2 text-xs" : "w-full px-3 py-2.5 text-sm"
      } ${
        active
          ? "bg-butter text-ink shadow-sm"
          : "text-muted-ink hover:bg-surface hover:text-ink"
      }`}
    >
      <span aria-hidden="true" className="w-4 text-center text-base leading-none">
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function AppShell({ userEmail, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-paper text-ink md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface px-4 py-5 md:flex md:min-h-screen md:flex-col">
        <Link href="/app" className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span aria-hidden="true" className="text-2xl">
            {brandConfig.mark}
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold tracking-[-0.03em] text-ink">
              {brandConfig.name}
            </span>
            <span className="block truncate text-xs text-muted-ink">{brandConfig.descriptor}</span>
          </span>
        </Link>

        <Link
          href="/app/new"
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-coral px-4 py-3 text-sm font-semibold text-ink transition-[background-color,box-shadow] duration-150 hover:bg-coral/85 focus-visible:relative focus-visible:z-10 motion-reduce:transition-none"
        >
          <span aria-hidden="true">+</span>
          New simulation
        </Link>

        <nav aria-label="Workspace" className="mt-5 space-y-1">
          {navigationItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-auto border-t border-line pt-4">
          <p className="truncate px-3 pb-3 text-xs text-muted-ink" title={userEmail}>
            {userEmail}
          </p>
          <SignOutButton className="w-full justify-center" />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/app" className="flex min-w-0 items-center gap-2 rounded-lg">
              <span aria-hidden="true" className="text-xl">
                {brandConfig.mark}
              </span>
              <span className="truncate text-sm font-semibold tracking-[-0.02em]">{brandConfig.name}</span>
            </Link>
            <Link
              href="/app/new"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-coral px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-coral/85 motion-reduce:transition-none"
            >
              <span aria-hidden="true">+</span>
              New
            </Link>
          </div>
          <nav aria-label="Workspace" className="mt-3 -mx-1 flex gap-1 overflow-x-auto pb-1">
            {navigationItems.map((item) => (
              <NavLink key={item.href} {...item} compact />
            ))}
          </nav>
          <div className="mt-3 flex justify-end">
            <SignOutButton className="justify-center" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
