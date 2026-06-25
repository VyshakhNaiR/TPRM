"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gauge,
  Building2,
  ShieldCheck,
  LayoutGrid,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoLockup, AnimatedLogo } from "@/components/animated-logo";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof Gauge };

const NAV: NavItem[] = [
  { href: "/console", label: "Console", icon: Gauge },
  { href: "/onboard", label: "Onboard vendor", icon: Building2 },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/portfolio", label: "Portfolio", icon: LayoutGrid },
  { href: "/changelog", label: "Changelog", icon: History },
];

const STORAGE_KEY = "ni.sidebar";

interface SidebarProps {
  /** Path of the currently active page, used to highlight the matching link. */
  activeHref?: string;
  /** Whether the off-canvas drawer is open on small screens. */
  mobileOpen: boolean;
  /** Close the off-canvas drawer (overlay click / Esc / link click). */
  onMobileClose: () => void;
}

export function Sidebar({ activeHref = "/console", mobileOpen, onMobileClose }: SidebarProps) {
  // Collapsed = slim icons-only rail. Persisted in localStorage.
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore storage access errors */
    }
    setHydrated(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onMobileClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  // Avoid a hydration mismatch on the persisted width — render expanded until hydrated.
  const isCollapsed = hydrated && collapsed;

  return (
    <>
      {/* Desktop / tablet rail */}
      <motion.aside
        aria-label="Primary"
        animate={{ width: isCollapsed ? 68 : 248 }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-border bg-surface/60 backdrop-blur md:flex"
      >
        <SidebarInner
          collapsed={isCollapsed}
          activeHref={activeHref}
          onToggleCollapsed={toggleCollapsed}
          onNavigate={() => {}}
        />
      </motion.aside>

      {/* Mobile off-canvas drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm" onClick={onMobileClose} aria-hidden="true" />
            <motion.aside
              aria-label="Primary"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="relative z-10 flex h-full w-[248px] flex-col border-r border-border bg-surface shadow-glow"
            >
              <button
                onClick={onMobileClose}
                aria-label="Close navigation"
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg"
              >
                <X size={16} />
              </button>
              <SidebarInner
                collapsed={false}
                activeHref={activeHref}
                onToggleCollapsed={undefined}
                onNavigate={onMobileClose}
              />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarInner({
  collapsed,
  activeHref,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  activeHref: string;
  onToggleCollapsed?: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cn("flex h-[60px] shrink-0 items-center border-b border-border px-3", collapsed && "justify-center")}>
        <Link href="/" onClick={onNavigate} aria-label="Home" className="flex items-center">
          {collapsed ? <AnimatedLogo width={34} variant="mark" /> : <LogoLockup markWidth={34} />}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV.map((item) => {
          const active = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                collapsed && "justify-center px-0",
                active
                  ? "border-brand/50 bg-brand/10 text-brand shadow-glow-sm"
                  : "border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-fg"
              )}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer: collapse toggle (desktop), theme, sign out */}
      <div className="shrink-0 space-y-1 border-t border-border p-2">
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-muted transition hover:border-border hover:bg-surface-2 hover:text-fg",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? <PanelLeftOpen size={18} className="shrink-0" /> : <PanelLeftClose size={18} className="shrink-0" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        )}

        <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
          <ThemeToggle />
          <button
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            aria-label="Sign out"
            title="Sign out"
            className={cn(
              "flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted transition hover:text-fg",
              collapsed ? "h-9 w-9 justify-center px-0" : "flex-1 justify-center"
            )}
          >
            <LogOut size={16} className="shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
