"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useProject } from "@/lib/context/ProjectContext";
import { defaultFilename, downloadBlob } from "@/lib/images/download";
import type { SketchMedium } from "@/lib/types";

// Order per doc 01 §4.3.2.
const SKETCH_MEDIUMS: { medium: SketchMedium; label: string }[] = [
  { medium: "pencil", label: "Pencil" },
  { medium: "fine-line-fountain-pen", label: "Fine-line fountain pen" },
  { medium: "watercolour", label: "Watercolour" },
  { medium: "magic-marker", label: "Magic marker" },
];

export function PipelineBar() {
  const {
    project,
    renders,
    activeRenderId,
    isRendering,
    runRender,
    abortRender,
    pushToast,
  } = useProject();

  // Transient UI state per doc 02 §6 — not persisted. Clicking Render
  // (Photoreal) or Close Sketch Mode returns to null (photoreal default).
  const [sketchMode, setSketchMode] = useState<SketchMedium | null>(null);

  const activeRender = useMemo(
    () => renders.find((r) => r.id === activeRenderId) ?? null,
    [renders, activeRenderId],
  );

  if (!project) return null;

  const draftFilled = project.masterPrompt.draft.trim().length > 0;
  const hasLayers = project.masterPrompt.layers.length > 0;
  const promptReady = draftFilled || hasLayers;
  const needsSource = project.inputMode === "source" && !project.sourceImage;
  const notRenderable = needsSource || !promptReady;
  const renderDisabled = isRendering || notRenderable;

  const inSketchMode = sketchMode !== null;

  const disabledTooltip = needsSource
    ? "Choose a source image first."
    : !promptReady
      ? "Write something in the master prompt first."
      : "";

  const onRender = () => {
    if (renderDisabled) return;
    // Explicit photoreal action exits sketch sub-mode.
    setSketchMode(null);
    void runRender({ mode: "photoreal" });
  };

  const onSketchMedium = (medium: SketchMedium) => {
    if (renderDisabled) return;
    setSketchMode(medium);
    void runRender({ mode: "sketch", sketchMedium: medium });
  };

  const onCloseSketch = () => {
    setSketchMode(null);
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

  const saveLabel = inSketchMode ? "Save Sketch" : "Save Render";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Render Output Pipeline
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={onRender}
          disabled={renderDisabled}
          title={disabledTooltip}
        >
          {isRendering && !inSketchMode ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {isRendering && !inSketchMode ? "Rendering…" : "Render (Photoreal)"}
        </Button>
        {isRendering && (
          <Button
            variant="ghost"
            onClick={abortRender}
            title="Cancel this render"
          >
            <X size={14} /> Stop
          </Button>
        )}
        <span className="pl-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Sketch
        </span>
        {SKETCH_MEDIUMS.map(({ medium, label }) => {
          const active = sketchMode === medium;
          const rendering = isRendering && active;
          return (
            <Button
              key={medium}
              variant={active ? "primary" : "secondary"}
              onClick={() => onSketchMedium(medium)}
              disabled={renderDisabled}
              title={
                notRenderable
                  ? disabledTooltip
                  : `Render as ${label.toLowerCase()}`
              }
              className="px-2 py-1.5 text-xs"
            >
              {rendering ? (
                <Loader2 size={12} className="animate-spin" />
              ) : null}
              {label}
            </Button>
          );
        })}
        {inSketchMode && (
          <Button
            variant="ghost"
            onClick={onCloseSketch}
            title="Return to the photoreal default bar"
            className="text-xs"
          >
            Close Sketch Mode
          </Button>
        )}
        <div className="mx-2 h-6 w-px bg-[var(--color-border)]" />
        <Button
          variant="secondary"
          onClick={onSave}
          disabled={!activeRender}
          title={
            activeRender
              ? `Save active ${inSketchMode ? "sketch" : "render"} as 4K PNG`
              : "Render first"
          }
        >
          <Download size={14} />
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
