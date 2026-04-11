import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { api } from "@/integrations/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordModal({ onSuccess }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(current, next);
      onSuccess();
    } catch (err) {
      setError(err.message || "Password change failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Security requirement</div>
            <div className="text-xs text-slate-400">You must set a new password before continuing</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Current password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="h-11 rounded-xl border-slate-700 bg-slate-800 pl-9 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-0"
                autoComplete="current-password"
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
              New password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="h-11 rounded-xl border-slate-700 bg-slate-800 pl-9 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-0"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Minimum 8 characters</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Confirm new password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-11 rounded-xl border-slate-700 bg-slate-800 pl-9 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-0"
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/70 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          <Button
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600"
            type="submit"
            disabled={loading}
          >
            {loading ? "Updating…" : "Set new password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
