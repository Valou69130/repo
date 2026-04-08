import { cn } from "@/domain/utils";
import { cva } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-slate-900 text-white shadow hover:bg-slate-800",
        secondary: "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-200",
        destructive: "border-transparent bg-red-500 text-white shadow hover:bg-red-500/80",
        outline: "text-slate-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
