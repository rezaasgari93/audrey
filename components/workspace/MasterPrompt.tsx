"use client";

import { useRef } from "react";

import { useProject } from "@/lib/context/ProjectContext";
import { PromptHistory } from "@/components/workspace/PromptHistory";

const PLACEHOLDER =
  "Describe materials, textures, and lighting. Quote [REF 01] to link reference images.";

export function MasterPrompt() {
  const { project, setMasterDraft } = useProject();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!project) return null;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        Master Prompt
      </label>
      <textarea
        ref={textareaRef}
        id="audrey-master-prompt"
        value={project.masterPrompt.draft}
        onChange={(e) => setMasterDraft(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={5}
        className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm leading-snug text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <PromptHistory />
    </div>
  );
}

// Module-level helper used by ReferenceGallery to insert [REF NN] at the
// current cursor position in the master-prompt textarea.
export function insertRefTokenAtCursor(token: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(
    "audrey-master-prompt",
  ) as HTMLTextAreaElement | null;
  if (!el) return false;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const needsLeadingSpace = start > 0 && !/\s$/.test(el.value.slice(0, start));
  const insertion = `${needsLeadingSpace ? " " : ""}${token} `;
  const next = el.value.slice(0, start) + insertion + el.value.slice(end);
  // Drive the React state via the existing onChange.
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  // Restore cursor after the inserted token.
  const caret = start + insertion.length;
  el.selectionStart = el.selectionEnd = caret;
  el.focus();
  return true;
}
