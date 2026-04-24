import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : "/api");

export function DownloadPdfButton({ callId, className }) {
  const [state, setState] = useState("idle"); // "idle" | "generating" | "error"

  const handleClick = async () => {
    setState("generating");
    try {
      const res = await fetch(`${BASE}/margin-calls/${callId}/pdf`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `margin-call-${callId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <div className={className}>
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={state === "generating"}
        className="gap-2"
      >
        {state === "generating" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        {state === "generating" ? "Generating…" : "Download PDF"}
      </Button>
      {state === "error" && (
        <p className="mt-1.5 text-xs text-red-600">
          PDF generation failed.{" "}
          <button
            onClick={() => setState("idle")}
            className="underline hover:text-red-800"
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
