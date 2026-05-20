"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, FileText, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useProject } from "@/lib/context/ProjectContext";
import {
  ACCEPTED_EXTS,
  describeUploadError,
  processUpload,
} from "@/lib/images/upload";

export function SourceEmptyButtons() {
  const {
    project,
    setInputMode,
    setSourceImage,
    resetAll,
    pushToast,
  } = useProject();

  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingMode, setPendingMode] = useState<null | "empty">(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!project) return null;

  const onSourceClick = () => {
    fileRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so picking the same file twice retriggers
    if (!file) return;
    const res = await processUpload(file);
    if (!res.ok) {
      pushToast("error", describeUploadError(res.error));
      return;
    }
    await setSourceImage(res.result);
    pushToast("success", "Source image loaded.");
  };

  const onEmptyClick = () => {
    if (project.inputMode === "empty") return;
    if (project.sourceImage) {
      setPendingMode("empty");
    } else {
      void setInputMode("empty");
    }
  };

  const confirmEmpty = async () => {
    setPendingMode(null);
    await setInputMode("empty");
  };

  const onReset = () => setConfirmReset(true);
  const doReset = async () => {
    setConfirmReset(false);
    await resetAll();
  };

  const sourceActive = project.inputMode === "source";
  const emptyActive = project.inputMode === "empty";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          variant={sourceActive ? "primary" : "secondary"}
          fullWidth
          onClick={onSourceClick}
        >
          <ImageIcon size={14} /> Source
        </Button>
        <Button
          variant={emptyActive ? "primary" : "secondary"}
          fullWidth
          onClick={onEmptyClick}
        >
          <FileText size={14} /> Empty
        </Button>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="self-start text-xs font-medium text-[var(--color-danger)] no-select hover:underline"
      >
        <RotateCcw size={11} className="mr-1 inline" /> Reset All
      </button>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_EXTS.join(",")}
        className="hidden"
        onChange={onFileChange}
      />

      <ConfirmModal
        open={pendingMode === "empty"}
        title="Switch to Empty mode?"
        body="The current source image will be cleared. References, prompt, and scene settings are preserved."
        confirmLabel="Switch"
        confirmVariant="primary"
        onConfirm={confirmEmpty}
        onCancel={() => setPendingMode(null)}
      />
      <ConfirmModal
        open={confirmReset}
        title="Reset everything in this workspace?"
        body={
          <>
            <p>This clears the source image, all references, the master prompt, and the render history.</p>
            <p className="mt-2 text-xs">
              Tip: save any outputs you want to keep before resetting.
            </p>
          </>
        }
        confirmLabel="Reset"
        confirmVariant="danger"
        onConfirm={doReset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
