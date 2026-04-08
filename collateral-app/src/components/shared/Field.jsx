export function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-500">{label}</div>
      {children}
    </div>
  );
}
