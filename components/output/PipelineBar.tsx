"use client";

import { useEffect, useMemo, useState } from "react";
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

  // Sub-mode visibility is DERIVED from activeRender.mode so that reverting
  // to a sketch from history auto-expands the medium row, and so a failed /
  // aborted sketch render doesn't leave the sub-mode pinned. Two transient
  // overrides:
  //   - `renderingMedium`: which medium is currently in flight (spinner + primary
  //     highlight during the request; cleared automatically on completion).
  //   - `justClosedSketch`: user explicitly clicked "Close Sketch Mode" — hides
  //     the sub-mode even though activeRender is still a sketch. Cleared
  //     whenever the active render changes (a new render or a revert), so
  //     the flag never sticks across navigation.
  const [renderingMedium, setRenderingMedium] = useState<SketchMedium | null>(
    null,
  );
  const [justClosedSketch, setJustClosedSketch] = useState(false);

  const activeRender = useMemo(
    () => renders.find((r) => r.id === activeRenderId) ?? null,
    [renders, activeRenderId],
  );

  // Clear the in-flight medium when the render finishes (success or fail).
  useEffect(() => {
    if (!isRendering) setRenderingMedium(null);
  }, [isRendering]);

  // Any change to the active render (new render lands, user reverts) makes
  // the previous explicit Close moot — reset the override.
  useEffect(() => {
    setJustClosedSketch(false);
  }, [activeRenderId]);

  if (!project) return null;

  const draftFilled = project.masterPrompt.draft.trim().length > 0;
  const hasLayers = project.masterPrompt.layers.length > 0;
  const promptReady = draftFilled || hasLayers;
  const needsSource = project.inputMode === "source" && !project.sourceImage;
  const notRenderable = needsSource || !promptReady;
  const renderDisabled = isRendering || notRenderable;

  const activeIsSketch = activeRender?.mode === "sketch";
  const activeMedium: SketchMedium | null =
    renderingMedium ??
    (activeIsSketch && !justClosedSketch
      ? (activeRender?.sketchMedium ?? null)
      : null);
  const inSketchMode = activeMedium !== null;

  // Save label / tooltip / filename all describe the ACTIVE render, not the
  // current UI sub-mode. Divergence here was the PR2 blocker.
  const activeIsSketchForSave = activeRender?.mode === "sketch";
  const saveLabel = activeIsSketchForSave ? "Save Sketch" : "Save Render";
  const saveTooltip = activeRender
    ? `Save active ${activeIsSketchForSave ? "sketch" : "render"} as 4K PNG`
    : "Render first";

  const disabledTooltip = isRendering
    ? "Render in progress…"
    : needsSource
      ? "Choose a source image first."
      : !promptReady
        ? "Write something in the master prompt first."
        : "";

  const onRender = () => {
    if (renderDisabled) return;
    // Explicit photoreal action exits sketch sub-mode until a new sketch
    // render / revert changes the active render.
    setJustClosedSketch(true);
    void runRender({ mode: "photoreal" });
  };

  const onSketchMedium = (medium: SketchMedium) => {
    if (renderDisabled) return;
    setJustClosedSketch(false);
    setRenderingMedium(medium);
    void runRender({ mode: "sketch", sketchMedium: medium });
  };

  const onCloseSketch = () => {
    setJustClosedSketch(true);
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
          {isRendering && renderingMedium === null ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {isRendering && renderingMedium === null
            ? "Rendering…"
            : "Render (Photoreal)"}
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
          const active = activeMedium === medium;
          const rendering = isRendering && renderingMedium === medium;
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
        <div className="mx-2 h-6 w-px bg-[var(--color-border)]" />
        <Button
          variant="secondary"
          onClick={onSave}
          disabled={!activeRender}
          title={saveTooltip}
        >
          <Download size={14} />
          {saveLabel}
        </Button>
        {inSketchMode && (
          <Button
            variant="ghost"
            onClick={onCloseSketch}
            title="Return to the photoreal default bar"
            className="ml-1 text-xs"
          >
            Close Sketch Mode
          </Button>
        )}
      </div>
    </div>
  );
}
