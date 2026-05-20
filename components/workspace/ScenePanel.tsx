"use client";

import { useProject } from "@/lib/context/ProjectContext";
import type {
  CameraAngle,
  LightMode,
  PeopleDensity,
  SourceMode,
} from "@/lib/types";

const SOURCE_MODE_OPTIONS: { value: SourceMode; label: string }[] = [
  { value: "interior", label: "Interior" },
  { value: "isometric", label: "Isometric" },
];

const CAMERA_OPTIONS: { value: CameraAngle; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "wide-angle", label: "Wide angle" },
  { value: "corner-view", label: "Corner view" },
  { value: "eye-level", label: "Eye level" },
  { value: "detail-shot", label: "Detail shot" },
];

const LIGHT_OPTIONS: { value: LightMode; label: string }[] = [
  { value: "daylight", label: "Daylight" },
  { value: "night", label: "Night" },
  { value: "golden-hour", label: "Golden hour" },
];

const PEOPLE_OPTIONS: { value: PeopleDensity; label: string }[] = [
  { value: "none", label: "None" },
  { value: "subtle", label: "Subtle" },
  { value: "minor", label: "Minor" },
  { value: "heavy", label: "Heavy" },
];

export function ScenePanel() {
  const { project, setScene } = useProject();
  if (!project) return null;
  const s = project.scene;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        Scene
      </div>

      <Group label="Source Mode">
        {SOURCE_MODE_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            active={s.sourceMode === opt.value}
            onClick={() => void setScene({ sourceMode: opt.value })}
            label={opt.label}
          />
        ))}
      </Group>

      <Group label="Camera Angle">
        {CAMERA_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            active={s.cameraAngle === opt.value}
            onClick={() => void setScene({ cameraAngle: opt.value })}
            label={opt.label}
          />
        ))}
      </Group>

      <Group label="Light Mode">
        {LIGHT_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            active={s.lightMode === opt.value}
            onClick={() => void setScene({ lightMode: opt.value })}
            label={opt.label}
          />
        ))}
      </Group>

      <Group label="People">
        {PEOPLE_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            active={s.people === opt.value}
            onClick={() => void setScene({ people: opt.value })}
            label={opt.label}
          />
        ))}
      </Group>
    </section>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] no-select transition-colors ${
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-black"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:border-[#3a3a3a]"
      }`}
    >
      {label}
    </button>
  );
}
