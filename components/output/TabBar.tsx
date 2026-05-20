"use client";

export type OutputTab = "comparison" | "amendment-mask" | "crop-image";

const TABS: { value: OutputTab; label: string }[] = [
  { value: "comparison", label: "Comparison" },
  { value: "amendment-mask", label: "Amendment Mask" },
  { value: "crop-image", label: "Crop Image" },
];

export function TabBar({
  value,
  onChange,
}: {
  value: OutputTab;
  onChange: (next: OutputTab) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-4 py-2">
      {TABS.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`rounded-full px-3 py-1 text-xs no-select transition-colors ${
              active
                ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
