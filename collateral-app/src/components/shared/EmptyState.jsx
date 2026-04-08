export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
      <div className="rounded-md bg-slate-100 p-4">
        <Icon className="h-8 w-8 text-slate-400" />
      </div>
      <div className="font-medium text-slate-700">{title}</div>
      <div className="text-sm text-slate-500">{description}</div>
    </div>
  );
}
