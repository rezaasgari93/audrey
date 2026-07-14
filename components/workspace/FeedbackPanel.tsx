"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useProject } from "@/lib/context/ProjectContext";

export function FeedbackPanel() {
  const { project, pushToast } = useProject();
  const [text, setText] = useState("");

  if (!project) return null;

  const recipient = process.env.NEXT_PUBLIC_FEEDBACK_RECIPIENT_EMAIL ?? "";

  const onSubmit = () => {
    const subject = `Audrey feedback — ${project.name}`;
    if (!recipient) {
      pushToast(
        "warning",
        "Set NEXT_PUBLIC_FEEDBACK_RECIPIENT_EMAIL in .env.local to send feedback.",
      );
      return;
    }
    const href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = href;
    pushToast("info", "Opening your email app…");
  };

  return (
    <section className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        Learning & Improvement
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="App feedback for model development..."
        rows={3}
        className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm leading-snug text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <Button variant="secondary" onClick={onSubmit} disabled={text.trim().length === 0}>
        Submit Feedback
      </Button>
    </section>
  );
}
