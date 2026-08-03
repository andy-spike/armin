"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Brain, Settings, Sparkles, ListFilter, FileText } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Kbd } from "@/components/ui/kbd";
import type { AuthUser } from "@/lib/auth";
import { useSettingsKeymap, useKeybinding } from "@/lib/keybindings/dispatcher";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Decks", command: "nav.decks" },
  { href: "/review", label: "Review", command: "nav.review" },
  { href: "/cram", label: "Cram", command: "nav.cram" },
  { href: "/browse", label: "Browse", command: "nav.browse" },
];

const ACCOUNT_NAV = [
  { href: "/settings", label: "Settings", command: "nav.settings" },
  { href: "/settings/billing", label: "Billing", command: "nav.billing" },
];

const MOBILE_NAV = [
  { href: "/", label: "Decks", icon: BookOpen },
  { href: "/review", label: "Review", icon: FileText },
  { href: "/cram", label: "Cram", icon: Sparkles },
  { href: "/browse", label: "Browse", icon: ListFilter },
  { href: "/settings", label: "Settings", icon: Settings },
];

function keysFor(commandId: string, keymap: Map<string, string[]>): string[] {
  return keymap.get(commandId) ?? [];
}

function NavLink({
  href,
  label,
  keys,
  active,
}: {
  href: string;
  label: string;
  keys: string[];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-[var(--color-surface)] text-[var(--color-text)] font-medium"
          : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
      )}
      aria-current={active ? "page" : undefined}
    >
      <span>{label}</span>
      {keys.length > 0 && (
        <span className="hidden opacity-0 transition-opacity group-hover:opacity-100 md:flex">
          {keys.map((k, i) => (
            <Kbd key={i} sequential={i > 0}>
              {k}
            </Kbd>
          ))}
        </span>
      )}
    </Link>
  );
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: AuthUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { effective } = useSettingsKeymap();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  };

  useKeybinding("global", "nav.decks", () => router.push("/"));
  useKeybinding("global", "nav.review", () => router.push("/review"));
  useKeybinding("global", "nav.cram", () => router.push("/cram"));
  useKeybinding("global", "nav.browse", () => router.push("/browse"));
  useKeybinding("global", "nav.graph", () => router.push("/deck/d-orgchem/graph"));
  useKeybinding("global", "nav.settings", () => router.push("/settings"));
  useKeybinding("global", "nav.billing", () => router.push("/settings/billing"));

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[var(--color-surface)] bg-[var(--color-canvas)] px-3 py-5 md:flex">
        <div className="px-2 pb-6">
          <Brand size="sm" />
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Primary">
          <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Study
          </p>
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              keys={keysFor(item.command, effective)}
              active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
            />
          ))}
        </nav>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Account">
          <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Account
          </p>
          {ACCOUNT_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              keys={keysFor(item.command, effective)}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <div className="flex items-center justify-between px-2">
            <ThemeToggle />
            <button
              onClick={signOut}
              className="text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              Sign out
            </button>
          </div>
          <div className="flex items-center gap-2.5 border-t border-[var(--color-surface)] px-2 pt-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)]">
              <Brain className="h-3.5 w-3.5 text-[var(--color-muted)]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[var(--color-text)]">
                {user.name}
              </p>
              <p className="truncate font-mono text-[10px] text-[var(--color-muted)]">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--color-surface)] bg-[var(--color-canvas)]/85 px-4 backdrop-blur md:hidden">
          <Brand size="sm" />
          <ThemeToggle />
        </header>
        <main className="mx-auto min-h-[calc(100dvh-3.5rem)] max-w-4xl px-4 pb-24 pt-8 md:px-10 md:pb-12 md:pt-12">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--color-surface)] bg-[var(--color-canvas)]/95 backdrop-blur md:hidden"
        aria-label="Mobile"
      >
        {MOBILE_NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px]",
                active
                  ? "text-[var(--color-accent)]"
                  : "text-[var(--color-muted)]",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
