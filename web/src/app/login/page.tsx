"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import { AnimatedLogo } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";

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
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Invalid credentials");
      return;
    }
    const { session } = await res.json();
    router.push(session.role === "vendor" ? "/vendor" : "/console");
  }

  function quick(u: string) {
    setUsername(u);
    setPassword("demo");
  }

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="glass w-full max-w-sm rounded-3xl p-8"
      >
        <div className="mb-6 grid place-items-center">
          <AnimatedLogo width={150} />
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            className="w-full rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-sm outline-none focus:border-brand"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-sm outline-none focus:border-brand"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            <LogIn size={16} />
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-5 border-t border-border pt-4 text-center text-xs text-muted">
          <p className="mb-2">Demo accounts (password: <span className="font-mono">demo</span>)</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => quick("apex")} className="rounded-lg border border-border px-3 py-1 hover:text-fg">Vendor (apex)</button>
            <button onClick={() => quick("dbs")} className="rounded-lg border border-border px-3 py-1 hover:text-fg">Assessor (dbs)</button>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
