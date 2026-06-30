"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import { AnimatedLogo } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";

function FloatingOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand/10 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -28, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-mas/10 blur-3xl"
        animate={{ x: [0, -36, 0], y: [0, 24, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ok/5 blur-3xl"
        animate={{ scale: [1, 1.25, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        let msg = "Invalid credentials";
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* not JSON */
        }
        setError(msg);
        return;
      }
      const { session } = await res.json();
      const landing: Record<string, string> = { root: "/admin", customer: "/customer", assessor: "/console", vendor: "/vendor" };
      router.replace(landing[session.role] ?? "/console");
    } catch {
      setError("Network error — could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function quick(u: string) {
    setUsername(u);
    setPassword("demo");
  }

  return (
    <main className="relative grid min-h-screen place-items-center px-6">
      <FloatingOrbs />
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="glass w-full max-w-sm rounded-3xl p-8"
      >
        <div className="mb-6 grid place-items-center gap-2">
          <AnimatedLogo width={150} />
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-center text-xs text-muted"
          >
            AI-powered third-party risk, built for financial regulators
          </motion.p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="login-username" className="mb-1 block text-xs font-medium text-muted">Username</label>
            <input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              className="w-full rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-xs font-medium text-muted">Password</label>
            <input
              id="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-sm outline-none focus:border-brand"
            />
          </div>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <button
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            <LogIn size={16} />
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-6 border-t border-border pt-4 text-center text-xs text-muted">
          <p className="mb-2">Demo accounts (password: <span className="font-mono">demo</span>)</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => quick("root")} className="rounded-lg border border-border px-3 py-1 hover:text-fg">Root</button>
            <button onClick={() => quick("dbs")} className="rounded-lg border border-border px-3 py-1 hover:text-fg">Assessor</button>
            <button onClick={() => quick("apex")} className="rounded-lg border border-border px-3 py-1 hover:text-fg">Vendor</button>
            <button onClick={() => quick("customer")} className="rounded-lg border border-border px-3 py-1 hover:text-fg">Customer</button>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
