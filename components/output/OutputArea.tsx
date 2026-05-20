"use client";

import { useMemo, useState } from "react";

import { TabBar, type OutputTab } from "@/components/output/TabBar";
import { ComparisonView } from "@/components/output/ComparisonView";
import { HistoryStrip } from "@/components/output/HistoryStrip";
import { PipelineBar } from "@/components/output/PipelineBar";
import { useProject } from "@/lib/context/ProjectContext";

export function OutputArea() {
  const [tab, setTab] = useState<OutputTab>("comparison");
  const { renders, activeRenderId, project } = useProject();

  const activeRender = useMemo(
    () => renders.find((r) => r.id === activeRenderId) ?? null,
    [renders, activeRenderId],
  );

  return (
    <section className="flex h-full flex-col bg-[var(--color-bg)]">
      <TabBar value={tab} onChange={setTab} />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        <CanvasArea tab={tab} activeRender={activeRender} project={project} />
      </div>
      <HistoryStrip />
      <PipelineBar />
    </section>
  );
}

function CanvasArea({
  tab,
  activeRender,
  project,
}: {
  tab: OutputTab;
  activeRender: ReturnType<typeof useProject>["renders"][number] | null;
  project: ReturnType<typeof useProject>["project"];
}) {
  const { isRendering, renderError } = useProject();

  if (isRendering) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-[var(--color-text-muted)]">
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div className="h-full w-1/3 animate-pulse bg-[var(--color-accent)]" />
        </div>
        <div>Rendering…</div>
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="flex max-w-md flex-col items-center gap-2 rounded-md border border-[#5a1f1f] bg-[#241010] p-4 text-sm text-[#f3a0a0]">
        <div className="font-medium">Render failed</div>
        <div className="text-center text-xs leading-relaxed">{renderError}</div>
      </div>
    );
  }

  if (tab === "comparison") {
    return <ComparisonView activeRender={activeRender} project={project} />;
  }

  if (tab === "amendment-mask") {
    return (
      <div className="text-sm text-[var(--color-text-muted)]">
        Amendment Mask — lands in milestone 6 (post-pause).
      </div>
    );
  }

  return (
    <div className="text-sm text-[var(--color-text-muted)]">
      Crop Image — lands in milestone 7 (post-pause).
    </div>
  );
}
