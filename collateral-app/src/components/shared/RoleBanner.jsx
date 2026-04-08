import { EyeOff } from "lucide-react";

export function RoleBanner({ role, perms }) {
  if (!perms?.readOnly) return null;
  return (
    <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded px-4 py-2.5 text-sm text-slate-600 mb-4">
      <EyeOff className="h-4 w-4 text-slate-400 flex-shrink-0" />
      <div>
        <span className="font-semibold text-slate-700">{role}</span>
        <span className="mx-1.5 text-slate-400">·</span>
        <span>Read-only access — all actions are disabled for this role.</span>
        <span className="ml-1.5 text-slate-500">{perms.description}</span>
      </div>
    </div>
  );
}
