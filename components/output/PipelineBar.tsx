"use client";

import { useMemo } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useProject } from "@/lib/context/ProjectContext";
import { defaultFilename, downloadBlob } from "@/lib/images/download";

export function PipelineBar() {
  const {
    project,
    renders,
    activeRenderId,
    isRendering,
    runRender,
    pushToast,
  } = useProject();

  const activeRender = useMemo(
    () => renders.find((r) => r.id === activeRenderId) ?? null,
    [renders, activeRenderId],
  );

  if (!project) return null;

  const draftFilled = project.masterPrompt.draft.trim().length > 0;
  const hasLayers = project.masterPrompt.layers.length > 0;
  const promptReady = draftFilled || hasLayers;
  const needsSource = project.inputMode === "source" && !project.sourceImage;
  const renderDisabled = isRendering || needsSource || !promptReady;

  const renderTooltip = needsSource
    ? "Choose a source image first."
    : !promptReady
      ? "Write something in the master prompt first."
      : "";

  const onRender = () => {
    if (renderDisabled) return;
    void runRender({ mode: "photoreal" });
  };

  const onSave = () => {
    if (!activeRender) {
      pushToast("warning", "No render to save yet.");
      return;
    }
    const filename = defaultFilename({
      projectName: project.name,
      mode: activeRender.mode === "sketch" ? "sketch" : "render",
    });
    downloadBlob(activeRender.outputBlob, filename);
  };

  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Render Output Pipeline
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={onRender}
          disabled={renderDisabled}
          title={renderTooltip}
        >
          {isRendering ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {isRendering ? "Rendering…" : "Render (Photoreal)"}
        </Button>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          Sketch · coming after pause
        </span>
        <div className="mx-2 h-6 w-px bg-[var(--color-border)]" />
        <Button
          variant="secondary"
          onClick={onSave}
          disabled={!activeRender}
          title={activeRender ? "Save active render as 4K PNG" : "Render first"}
        >
          <Download size={14} />
          Save Render
        </Button>
      </div>
    </div>
  );
}
