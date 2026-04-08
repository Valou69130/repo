import { useState } from "react";
import { Landmark, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/integrations/api";

export function Login({ onLogin }) {
  const [email, setEmail] = useState("treasury@banca-demo.ro");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await api.login(email, password);
      localStorage.setItem("co_token", token);
      localStorage.setItem("co_user", JSON.stringify(user));
      onLogin(user);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-full max-w-sm px-6">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-blue-600 p-2">
              <Landmark className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-white text-sm font-semibold tracking-wide">COLLATERAL ORCHESTRATOR</div>
              <div className="text-slate-500 text-xs">Romania Pilot · v1.0</div>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-white">Sign in</h1>
          <p className="text-slate-400 text-sm mt-1">Authorised users only. All access is logged.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 rounded focus:border-blue-500 focus:ring-0"
                autoComplete="email"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 rounded focus:border-blue-500 focus:ring-0"
                autoComplete="current-password"
              />
            </div>
          </div>
          {error && (
            <div className="bg-red-950 border border-red-800 text-red-400 text-xs px-3 py-2 rounded">
              {error}
            </div>
          )}
          <Button
            className="w-full rounded bg-blue-600 hover:bg-blue-700 text-white font-medium mt-2"
            type="submit"
            disabled={loading}
          >
            {loading ? "Authenticating..." : "Sign In"}
          </Button>
        </form>

        {/* Demo accounts */}
        <div className="mt-8 border border-slate-800 rounded">
          <div className="px-3 py-2 border-b border-slate-800">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Demo Accounts · password: demo1234</span>
          </div>
          <div className="divide-y divide-slate-800">
            {[
              ["Treasury Manager",   "treasury@banca-demo.ro"],
              ["Collateral Manager", "collateral@banca-demo.ro"],
              ["Operations Analyst", "operations@banca-demo.ro"],
              ["Risk Reviewer",      "risk@banca-demo.ro"],
            ].map(([role, mail]) => (
              <button
                key={mail}
                type="button"
                onClick={() => { setEmail(mail); setPassword("demo1234"); }}
                className="w-full flex justify-between items-center px-3 py-2.5 hover:bg-slate-900 transition text-left"
              >
                <span className="text-slate-300 text-xs font-medium">{role}</span>
                <span className="font-mono text-slate-500 text-xs">{mail}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-slate-700 text-xs mt-6">
          Banca Demo Romania · Collateral & Repo Platform · DEMO
        </p>
      </div>
    </div>
  );
}
