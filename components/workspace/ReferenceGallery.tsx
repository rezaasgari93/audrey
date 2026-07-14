"use client";

import { useRef } from "react";
import { Plus, X } from "lucide-react";

import { useProject } from "@/lib/context/ProjectContext";
import {
  ACCEPTED_EXTS,
  describeUploadError,
  processUpload,
  type ProcessedUpload,
} from "@/lib/images/upload";
import { insertRefTokenAtCursor } from "@/components/workspace/MasterPrompt";

const REFERENCE_CAP = 14;
const REFERENCE_WARN = 5;

export function ReferenceGallery() {
  const { project, addReferences, removeReference, pushToast } = useProject();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!project) return null;

  const remaining = REFERENCE_CAP - project.references.length;

  const onAddClick = () => {
    if (remaining <= 0) {
      pushToast("warning", `Reference cap reached (${REFERENCE_CAP}).`);
      return;
    }
    fileRef.current?.click();
  };

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const accepted: ProcessedUpload[] = [];
    for (const file of files) {
      const res = await processUpload(file);
      if (!res.ok) {
        pushToast("error", describeUploadError(res.error));
        continue;
      }
      accepted.push(res.result);
    }
    if (accepted.length > 0) {
      await addReferences(accepted);
    }
  };

  const onTileClick = (index: number) => {
    const token = `[REF ${index.toString().padStart(2, "0")}]`;
    const inserted = insertRefTokenAtCursor(token);
    if (!inserted) {
      navigator.clipboard?.writeText(token).catch(() => undefined);
      pushToast("info", `${token} copied — paste it into the master prompt.`);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Reference Gallery
        </label>
        <button
          type="button"
          onClick={onAddClick}
          className="flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] no-select hover:underline"
        >
          <Plus size={12} /> Add Refs
        </button>
      </div>

      {project.references.length > REFERENCE_WARN && (
        <div className="rounded border border-[#5a4a1a] bg-[#221d10] px-2 py-1 text-[11px] text-[#e8c97a]">
          {project.references.length} references — fidelity may degrade past {REFERENCE_WARN}.
        </div>
      )}

      {project.references.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
          No references yet. Add up to {REFERENCE_CAP}.
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {project.references.map((ref) => (
            <li key={ref.id} className="group relative">
              <button
                type="button"
                onClick={() => onTileClick(ref.index)}
                className="block w-full overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] no-select"
                title={`${ref.filename} — click to insert [REF ${ref.index.toString().padStart(2, "0")}]`}
              >
                <img
                  src={ref.thumbnailDataUrl}
                  alt={ref.filename}
                  className="aspect-square h-auto w-full object-cover"
                />
                <span className="absolute left-1 top-1 rounded bg-black/75 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">
                  [REF {ref.index.toString().padStart(2, "0")}]
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeReference(ref.id);
                }}
                className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white group-hover:flex"
                aria-label="Remove reference"
              >
                <X size={10} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_EXTS.join(",")}
        multiple
        className="hidden"
        onChange={onFiles}
      />
    </section>
  );
}
