import { useState } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/integrations/api";

const DEMO_USERS = [
  { role: "Treasury Manager",   email: "treasury@banca-demo.ro"   },
  { role: "Collateral Manager", email: "collateral@banca-demo.ro" },
  { role: "Operations Analyst", email: "operations@banca-demo.ro" },
  { role: "Risk Reviewer",      email: "risk@banca-demo.ro"       },
];

export function Login({ onLogin, onPrivacy }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { user, mustChangePassword } = await api.login(email, password);
      onLogin(user, mustChangePassword === true);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const fill = (u) => { setEmail(u.email); setPassword("demo1234"); };

  return (
    <div className="min-h-screen bg-[#0a0d14] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 border-r border-white/6 px-12 py-14">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Landmark className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-wide text-white">CollateralOS</span>
          </div>

          <div className="mt-16">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-600 mb-4">Treasury Operations</p>
            <h1 className="text-[2rem] font-semibold leading-snug text-white">
              Collateral, repo,<br />and margin workflows.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-500 max-w-xs">
              Position management, margin calls, and exception resolution — all in one place.
            </p>
          </div>
        </div>

        <div className="space-y-px">
          {DEMO_USERS.map((u) => (
            <button
              key={u.email}
              type="button"
              onClick={() => fill(u)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors hover:bg-white/4"
            >
              <span className="text-sm text-slate-400">{u.role}</span>
              <span className="font-mono text-[11px] text-slate-600">{u.email}</span>
            </button>
          ))}
          <p className="px-3 pt-2 text-[11px] text-slate-700">Password for all: demo1234</p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 lg:hidden mb-10">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Landmark className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-wide text-white">CollateralOS</span>
          </div>

          <h2 className="text-2xl font-semibold text-white">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-500">Enter your credentials to continue.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 rounded-lg border-white/8 bg-white/4 text-white placeholder:text-slate-700 focus:border-blue-500 focus:ring-0"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-lg border-white/8 bg-white/4 text-white placeholder:text-slate-700 focus:border-blue-500 focus:ring-0"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {/* Mobile demo access */}
          <div className="mt-8 lg:hidden">
            <p className="mb-2 text-xs text-slate-600 uppercase tracking-wider">Demo access</p>
            <div className="space-y-px">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => fill(u)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-white/4"
                >
                  <span className="text-xs text-slate-400">{u.role}</span>
                  <span className="font-mono text-[11px] text-slate-600">{u.email}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-10 text-xs text-slate-700">
            CollateralOS ·{" "}
            {onPrivacy ? (
              <button onClick={onPrivacy} className="underline hover:text-slate-500">Privacy Policy</button>
            ) : "Privacy Policy"}
          </p>
        </div>
      </div>
    </div>
  );
}
