"use client";

import { SourceEmptyButtons } from "@/components/workspace/SourceEmptyButtons";
import { MasterPrompt } from "@/components/workspace/MasterPrompt";
import { ReferenceGallery } from "@/components/workspace/ReferenceGallery";
import { ScenePanel } from "@/components/workspace/ScenePanel";
import { FeedbackPanel } from "@/components/workspace/FeedbackPanel";

export function InputPanel() {
  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto border-r border-[var(--color-border)] p-4">
      <SourceEmptyButtons />
      <MasterPrompt />
      <ReferenceGallery />
      <ScenePanel />
      <FeedbackPanel />
    </aside>
  );
}
