"use client";

import { useEffect, useRef, useState } from "react";

import type { Project, Render } from "@/lib/types";

interface ComparisonViewProps {
  project: Project | null;
  activeRender: Render | null;
}

export function ComparisonView({ project, activeRender }: ComparisonViewProps) {
  const sourceUrl = useObjectUrl(project?.sourceImage?.blob);
  const outputUrl = useObjectUrl(activeRender?.outputBlob);

  // No source AND no output: empty placeholder.
  if (!sourceUrl && !outputUrl) {
    const isEmpty = project?.inputMode === "empty";
    return (
      <div className="max-w-md text-center text-sm text-[var(--color-text-muted)]">
        {isEmpty
          ? "Describe a scene and render to generate it."
          : "Choose a source image to begin, or switch to Empty to generate from a description."}
      </div>
    );
  }

  // Empty mode: just show the active output (or a stub if none yet).
  if (!sourceUrl && outputUrl) {
    return (
      <img
        src={outputUrl}
        alt="Active render"
        className="max-h-full max-w-full object-contain"
      />
    );
  }

  // Source loaded, no output yet — show source full-width.
  if (sourceUrl && !outputUrl) {
    return (
      <img
        src={sourceUrl}
        alt="Source"
        className="max-h-full max-w-full object-contain"
      />
    );
  }

  // Both present — split slider.
  return <Slider beforeUrl={sourceUrl!} afterUrl={outputUrl!} />;
}

function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [blob]);
  return url;
}

function Slider({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string;
  afterUrl: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(50);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const next = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setPct(next);
    };
    const onPointerUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    // Trigger an immediate update at the click point.
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setPct(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-block max-h-full max-w-full touch-none select-none"
      onPointerDown={onPointerDown}
    >
      {/* The "after" image sets the intrinsic size. */}
      <img
        src={afterUrl}
        alt="After"
        className="block max-h-[78vh] max-w-full object-contain"
        draggable={false}
      />
      {/* The "before" image is absolutely positioned, clipped to pct%. */}
      <img
        src={beforeUrl}
        alt="Before"
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        draggable={false}
      />
      {/* Divider line + handle. */}
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-[var(--color-accent)]"
        style={{ left: `${pct}%` }}
      />
      <div
        className="absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-[var(--color-accent)] text-black shadow"
        style={{ left: `${pct}%` }}
      >
        <span className="text-[10px] font-bold">⇆</span>
      </div>
      {/* Subtle labels. */}
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white">
        Source
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white">
        Output
      </span>
    </div>
  );
}
