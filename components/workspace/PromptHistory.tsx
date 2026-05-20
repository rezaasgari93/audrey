"use client";

import { useProject } from "@/lib/context/ProjectContext";

export function PromptHistory() {
  const { project, renders, revertToRender, activeRenderId } = useProject();
  if (!project) return null;
  const layers = project.masterPrompt.layers;
  if (layers.length === 0) return null;

  return (
    <div className="mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        Prompt History
      </div>
      <ol className="flex flex-col gap-1 text-xs text-[var(--color-text)]">
        {layers.map((layer, i) => {
          const linked = renders.find((r) => r.id === layer.renderId);
          const isActive = activeRenderId === layer.renderId;
          return (
            <li
              key={layer.id}
              className={`group flex cursor-pointer items-start gap-2 rounded px-2 py-1 hover:bg-[var(--color-surface-2)] ${isActive ? "bg-[var(--color-surface-2)]" : ""}`}
              onClick={() => linked && void revertToRender(linked.id)}
              title="Revert to this render"
            >
              <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-[var(--color-text-muted)]">
                {i + 1}.
              </span>
              <span className="line-clamp-2 leading-snug">{layer.text}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
