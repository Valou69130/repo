import { useState } from "react";
import { ArrowRight, Landmark, Lock, Mail, ShieldCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/integrations/api";

export function Login({ onLogin, onPrivacy }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.28),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(16,185,129,0.16),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#111827_100%)] px-5 py-8 md:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-stretch gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative hidden overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-2xl shadow-blue-950/40 backdrop-blur lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(37,99,235,0.18),transparent_45%,rgba(14,165,233,0.08))]" />
          <div className="absolute -left-16 top-24 h-44 w-44 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute bottom-8 right-8 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs text-slate-200">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-500/30">
                <Landmark className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold tracking-[0.12em] text-white">CollateralOS</div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Treasury Operations Platform</div>
              </div>
            </div>

            <div className="mt-14 max-w-xl">
              <h1 className="text-4xl font-semibold leading-tight text-white">
                Run collateral, repo, and control workflows from one decision surface.
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-300">
                A bank-grade operating layer for treasury, collateral, operations, and risk teams. Review margin pressure,
                release trapped collateral, and move from signal to action without leaving the workflow.
              </p>
            </div>
          </div>

          <div className="relative grid gap-4 md:grid-cols-3">
            {[
              { icon: ShieldCheck, label: "Coverage monitored", value: "24/7", note: "Margin and exception surveillance" },
              { icon: TrendingUp, label: "Eligible collateral", value: "RON 26.9M", note: "Visible free pool capacity" },
              { icon: Landmark, label: "Regulatory scope", value: "EMIR · SFTR", note: "NBR Reg. 5/2013 aligned" },
            ].map(({ icon: Icon, label, value, note }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
                  <Icon className="h-4 w-4 text-blue-300" />
                </div>
                <div className="mt-4 text-2xl font-semibold text-white">{value}</div>
                <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950/80 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur md:p-8">
            <div className="mb-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-[0.12em] text-white">CollateralOS</div>
                  <div className="text-xs text-slate-500">Collateral & Repo Management</div>
                </div>
              </div>
              <h2 className="mt-6 text-3xl font-semibold text-white">Sign in to the control room</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Sign in with your institutional credentials to access the platform.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-xl border-slate-700 bg-slate-900 pl-9 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-0"
                    autoComplete="email"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl border-slate-700 bg-slate-900 pl-9 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-0"
                    autoComplete="current-password"
                  />
                </div>
              </div>
              {error && (
                <div className="rounded-xl border border-red-900 bg-red-950/70 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
              <Button
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                type="submit"
                disabled={loading}
              >
                {loading ? "Authenticating..." : "Enter Platform"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>

            <details className="mt-6 rounded-xl border border-white/6 bg-slate-900/50">
              <summary className="cursor-pointer px-4 py-2.5 text-xs text-slate-500 select-none hover:text-slate-400">
                Demo access
              </summary>
              <div className="border-t border-white/6 px-4 py-3 space-y-1.5">
                {[
                  { role: "Treasury Manager",    email: "treasury@banca-demo.ro"    },
                  { role: "Collateral Manager",  email: "collateral@banca-demo.ro"  },
                  { role: "Operations Analyst",  email: "operations@banca-demo.ro"  },
                  { role: "Risk Reviewer",       email: "risk@banca-demo.ro"        },
                ].map(({ role, email }) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => { setEmail(email); setPassword("demo1234"); }}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    <span className="text-xs text-slate-400">{role}</span>
                    <span className="font-mono text-[11px] text-slate-600">{email}</span>
                  </button>
                ))}
                <p className="pt-1 text-[11px] text-slate-700">Password: demo1234</p>
              </div>
            </details>

            <p className="mt-4 text-center text-xs text-slate-600">
              CollateralOS · Collateral & Repo Platform ·{" "}
              {onPrivacy ? (
                <button onClick={onPrivacy} className="underline hover:text-slate-400">
                  Privacy Policy
                </button>
              ) : (
                "Privacy Policy"
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
