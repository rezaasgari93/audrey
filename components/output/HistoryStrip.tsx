"use client";

import { useProject } from "@/lib/context/ProjectContext";

export function HistoryStrip() {
  const { renders, activeRenderId, setActiveRender, revertToRender } = useProject();

  if (renders.length === 0) {
    return (
      <div className="border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-[var(--color-text-muted)]">
        No renders yet — history will appear here.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-t border-[var(--color-border)] px-4 py-2">
      {renders.map((r) => {
        const active = r.id === activeRenderId;
        const modeLabel = r.mode === "sketch" ? "Sketch" : "Render";
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              setActiveRender(r.id);
              void revertToRender(r.id);
            }}
            title={`${modeLabel} · ${new Date(r.createdAt).toLocaleString()}`}
            className={`group relative h-16 w-16 shrink-0 overflow-hidden rounded border-2 transition-colors ${
              active
                ? "border-[var(--color-accent)]"
                : "border-transparent hover:border-[var(--color-border)]"
            }`}
          >
            <img
              src={r.outputThumbnailDataUrl}
              alt={modeLabel}
              className="h-full w-full object-cover"
            />
            <span className="absolute left-0.5 top-0.5 rounded bg-black/75 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white">
              {modeLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
