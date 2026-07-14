"use client";

import { InputPanel } from "@/components/workspace/InputPanel";
import { OutputArea } from "@/components/output/OutputArea";
import { Toaster } from "@/components/ui/Toaster";
import { ProjectProvider, useProject } from "@/lib/context/ProjectContext";

export default function Workspace() {
  return (
    <ProjectProvider>
      <WorkspaceShell />
    </ProjectProvider>
  );
}

function WorkspaceShell() {
  const { project, gallery } = useProject();

  return (
    <main className="grid h-screen grid-cols-[360px_1fr] grid-rows-[48px_1fr] bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="col-span-2 flex items-center justify-between border-b border-[var(--color-border)] px-4">
        <div className="text-sm font-medium tracking-wide">Audrey</div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {project && gallery
            ? `${project.name} — ${gallery.name}`
            : "Loading…"}
        </div>
      </header>
      <InputPanel />
      <OutputArea />
      <Toaster />
    </main>
  );
}
