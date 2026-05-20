"use client";

import { useProject } from "@/lib/context/ProjectContext";

const kindStyles: Record<string, string> = {
  info: "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]",
  success: "border-[#2c4a2c] bg-[#152015] text-[#b6dbb6]",
  warning: "border-[#5a4a1a] bg-[#221d10] text-[#e8c97a]",
  error: "border-[#5a1f1f] bg-[#241010] text-[#f3a0a0]",
};

export function Toaster() {
  const { toasts, dismissToast } = useProject();
  return (
    <div className="pointer-events-none fixed right-4 top-16 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-lg ${kindStyles[t.kind] ?? kindStyles.info}`}
          onClick={() => dismissToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
