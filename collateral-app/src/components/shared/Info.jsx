export function Info({ label, value }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="font-medium text-slate-900 mt-1">{value}</div>
    </div>
  );
}
