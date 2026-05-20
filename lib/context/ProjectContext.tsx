"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { nanoid } from "nanoid";

import {
  appendRender,
  getOrCreateDefaultProject,
  listRenders,
  saveProject,
} from "@/lib/db/projects";
import { blobForTransit } from "@/lib/images/downsample";
import { blobToBase64 } from "@/lib/images/blob";
import { makeThumbnail } from "@/lib/images/upload";
import type {
  AmendmentMask,
  Gallery,
  OutputMode,
  Project,
  PromptLayer,
  Reference,
  Render,
  RenderInputsSnapshot,
  RenderRequest,
  RenderResponse,
  SceneSettings,
  SketchMedium,
} from "@/lib/types";
import type { ProcessedUpload } from "@/lib/images/upload";

// ---------- Public shape ----------

export type ToastKind = "info" | "warning" | "error" | "success";
export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

export interface ProjectContextValue {
  project: Project | null;
  gallery: Gallery | null;
  renders: Render[];
  activeRenderId: string | null;
  isRendering: boolean;
  renderError: string | null;
  toasts: Toast[];

  // Project-level mutators.
  setInputMode(mode: "source" | "empty"): Promise<void>;
  setSourceImage(upload: ProcessedUpload): Promise<void>;
  clearSourceImage(): Promise<void>;
  setScene(partial: Partial<SceneSettings>): Promise<void>;
  setMasterDraft(draft: string): void;
  addReferences(uploads: ProcessedUpload[]): Promise<void>;
  removeReference(id: string): Promise<void>;
  resetAll(): Promise<void>;

  // Render orchestration.
  runRender(args: {
    mode: OutputMode;
    sketchMedium?: SketchMedium;
    amendment?: AmendmentMask;
  }): Promise<void>;
  setActiveRender(id: string | null): void;
  revertToRender(id: string): Promise<void>;

  // Toasts.
  pushToast(kind: ToastKind, message: string): void;
  dismissToast(id: string): void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside <ProjectProvider>");
  return ctx;
}

// ---------- Provider ----------

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [renders, setRenders] = useState<Render[]>([]);
  const [activeRenderId, setActiveRenderId] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { project: p, gallery: g } = await getOrCreateDefaultProject();
      const rs = await listRenders(g.id);
      if (cancelled) return;
      setProject(p);
      setGallery(g);
      setRenders(rs);
      setActiveRenderId(rs.length > 0 ? rs[rs.length - 1].id : null);
    })().catch((e) => {
      // eslint-disable-next-line no-console
      console.error("Failed to load project:", e);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Helpers ----------

  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = nanoid();
    setToasts((prev) => [...prev, { id, kind, message }]);
    if (kind !== "error") {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4_500);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateProject = useCallback(
    async (mutate: (p: Project) => Project) => {
      let next: Project | null = null;
      setProject((curr) => {
        if (!curr) return curr;
        next = mutate(curr);
        return next;
      });
      if (next) await saveProject(next);
    },
    [],
  );

  // ---------- Project mutators ----------

  const setInputMode = useCallback<ProjectContextValue["setInputMode"]>(
    async (mode) => {
      await updateProject((p) => ({
        ...p,
        inputMode: mode,
        sourceImage: mode === "empty" ? null : p.sourceImage,
      }));
    },
    [updateProject],
  );

  const setSourceImage = useCallback<ProjectContextValue["setSourceImage"]>(
    async (upload) => {
      await updateProject((p) => ({
        ...p,
        inputMode: "source",
        sourceImage: {
          blob: upload.blob,
          filename: upload.filename,
          width: upload.width,
          height: upload.height,
        },
      }));
    },
    [updateProject],
  );

  const clearSourceImage = useCallback<ProjectContextValue["clearSourceImage"]>(
    async () => {
      await updateProject((p) => ({ ...p, sourceImage: null }));
    },
    [updateProject],
  );

  const setScene = useCallback<ProjectContextValue["setScene"]>(
    async (partial) => {
      await updateProject((p) => ({ ...p, scene: { ...p.scene, ...partial } }));
    },
    [updateProject],
  );

  const setMasterDraft = useCallback<ProjectContextValue["setMasterDraft"]>(
    (draft) => {
      // Draft typing is high-frequency — debounce the persist by deferring it
      // to a microtask via updateProject's async write, which is fine.
      setProject((p) =>
        p ? { ...p, masterPrompt: { ...p.masterPrompt, draft } } : p,
      );
      // Persist on every keystroke is fine for a single-user IDB write.
      // If this proves slow we can debounce.
      void saveProjectDraft(draft);
    },
    [],
  );

  // Persist the in-progress draft without going through updateProject's
  // full clone-and-write each keystroke — small perf optimization.
  const saveProjectDraft = useCallback(
    async (draft: string) => {
      const curr = project;
      if (!curr) return;
      if (curr.masterPrompt.draft === draft) return;
      const next: Project = {
        ...curr,
        masterPrompt: { ...curr.masterPrompt, draft },
      };
      await saveProject(next);
    },
    [project],
  );

  const addReferences = useCallback<ProjectContextValue["addReferences"]>(
    async (uploads) => {
      await updateProject((p) => {
        const startIndex = (p.references.at(-1)?.index ?? 0) + 1;
        const cap = 14;
        const remaining = Math.max(0, cap - p.references.length);
        const toAdd = uploads.slice(0, remaining);
        if (toAdd.length < uploads.length) {
          pushToast(
            "warning",
            `Reference cap is ${cap} images; ${uploads.length - toAdd.length} skipped.`,
          );
        }
        const newRefs: Reference[] = toAdd.map((u, i) => ({
          id: nanoid(),
          index: startIndex + i,
          filename: u.filename,
          blob: u.blob,
          thumbnailDataUrl: u.thumbnailDataUrl,
          width: u.width,
          height: u.height,
          addedAt: Date.now(),
        }));
        const next = { ...p, references: [...p.references, ...newRefs] };
        if (next.references.length > 5) {
          pushToast(
            "info",
            `${next.references.length} references — fidelity may drop past 5.`,
          );
        }
        return next;
      });
    },
    [updateProject, pushToast],
  );

  const removeReference = useCallback<ProjectContextValue["removeReference"]>(
    async (id) => {
      await updateProject((p) => {
        const filtered = p.references.filter((r) => r.id !== id);
        // Renumber contiguously per doc 01 §3.3.
        const renumbered = filtered.map((r, i) => ({ ...r, index: i + 1 }));
        return { ...p, references: renumbered };
      });
      pushToast(
        "warning",
        "Reference removed. Earlier renders that referenced it may no longer be reproducible.",
      );
    },
    [updateProject, pushToast],
  );

  const resetAll = useCallback<ProjectContextValue["resetAll"]>(async () => {
    await updateProject((p) => ({
      ...p,
      sourceImage: null,
      references: [],
      masterPrompt: { draft: "", layers: [] },
      scene: {
        sourceMode: "interior",
        cameraAngle: "original",
        lightMode: "daylight",
        people: "none",
      },
    }));
    // Doc 04 §4.10: default behavior also clears render history.
    // We clear in-memory; we don't physically delete renders so a future
    // "Restore from trash" affordance is possible. (Not in v1 UI.)
    setRenders([]);
    setActiveRenderId(null);
    pushToast("success", "Workspace reset.");
  }, [updateProject, pushToast]);

  // ---------- Render orchestration ----------

  const runRender = useCallback<ProjectContextValue["runRender"]>(
    async ({ mode, sketchMedium, amendment }) => {
      if (!project || !gallery) return;
      if (isRendering) return; // Double-click guard.

      // Need a draft OR existing layers — otherwise nothing to render.
      const draftText = project.masterPrompt.draft.trim();
      const allLayerTexts = [...project.masterPrompt.layers.map((l) => l.text)];
      if (draftText) allLayerTexts.push(draftText);
      if (allLayerTexts.length === 0) {
        pushToast(
          "warning",
          "Write something in the master prompt before rendering.",
        );
        return;
      }

      if (project.inputMode === "source" && !project.sourceImage) {
        pushToast("warning", "Choose a source image first.");
        return;
      }

      setIsRendering(true);
      setRenderError(null);
      try {
        // Build request.
        let sourceImageBase64: string | null = null;
        let sourceMimeType: string | null = null;
        if (project.inputMode === "source" && project.sourceImage) {
          const t = await blobForTransit(project.sourceImage.blob);
          sourceImageBase64 = t.base64;
          sourceMimeType = t.mimeType;
        }
        const refs = await Promise.all(
          project.references.map(async (r) => {
            const t = await blobForTransit(r.blob);
            return { index: r.index, base64: t.base64, mimeType: t.mimeType };
          }),
        );

        // Amendment masks are stored as data URLs ("data:image/png;base64,…");
        // the wire format wants just the base64 payload.
        const amendmentForWire = amendment
          ? {
              maskBase64: stripDataUrlPrefix(amendment.maskDataUrl),
              localPrompt: amendment.localPrompt,
            }
          : undefined;

        const body: RenderRequest = {
          inputMode: project.inputMode,
          mode,
          sketchMedium,
          scene: project.scene,
          promptLayers: allLayerTexts,
          sourceImageBase64,
          sourceMimeType,
          references: refs,
          amendment: amendmentForWire,
        };

        const res = await fetch("/api/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          const msg =
            errBody?.error ??
            (res.status === 504 ? "Render timed out." : "Render failed.");
          const detail = errBody?.detail ? ` (${errBody.detail})` : "";
          throw new Error(`${msg}${detail}`);
        }

        const missing = res.headers.get("x-audrey-missing-refs");
        if (missing) {
          pushToast(
            "warning",
            `Reference ${missing} was missing and was skipped in the prompt.`,
          );
        }

        const data = (await res.json()) as RenderResponse;
        const outputBlob = base64ToBlob(data.imageBase64, data.mimeType);
        const outputThumbnailDataUrl = await makeThumbnail(outputBlob, 256);

        // Commit prompt layer (the just-typed draft becomes a layer).
        const renderId = nanoid();
        const newLayer: PromptLayer | null = draftText
          ? {
              id: nanoid(),
              text: draftText,
              renderId,
              createdAt: Date.now(),
            }
          : null;

        const snapshot: RenderInputsSnapshot = {
          inputMode: project.inputMode,
          scene: project.scene,
          promptLayers: allLayerTexts,
          references: project.references.map((r) => ({
            id: r.id,
            index: r.index,
            filename: r.filename,
          })),
          amendment,
          sourceImageRef: project.sourceImage ? "current-source" : null,
        };

        const render: Render = {
          id: renderId,
          galleryId: gallery.id,
          createdAt: Date.now(),
          mode,
          sketchMedium,
          inputs: snapshot,
          outputBlob,
          outputThumbnailDataUrl,
          model: {
            modelId: "gemini-3-pro-image-preview",
            durationMs: data.durationMs,
            thinkingUsed: data.thinkingUsed,
          },
        };

        await appendRender(render);
        await updateProject((p) => ({
          ...p,
          masterPrompt: {
            draft: "", // doc 01 §3.2 default: clear draft after commit
            layers: newLayer
              ? [...p.masterPrompt.layers, newLayer]
              : p.masterPrompt.layers,
          },
        }));
        setRenders((prev) => [...prev, render]);
        setActiveRenderId(render.id);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Unknown error during render.";
        setRenderError(msg);
        pushToast("error", msg);
      } finally {
        setIsRendering(false);
      }
    },
    [project, gallery, isRendering, pushToast, updateProject],
  );

  const setActiveRender = useCallback<ProjectContextValue["setActiveRender"]>(
    (id) => setActiveRenderId(id),
    [],
  );

  const revertToRender = useCallback<ProjectContextValue["revertToRender"]>(
    async (id) => {
      const target = renders.find((r) => r.id === id);
      if (!target || !project) return;
      // Roll master-prompt layers and scene back to this render's snapshot.
      const snapshotLayerTexts = target.inputs.promptLayers;
      // Match texts to existing layers where possible to keep IDs/timestamps.
      const matched: PromptLayer[] = [];
      const remaining = [...project.masterPrompt.layers];
      for (const text of snapshotLayerTexts) {
        const idx = remaining.findIndex((l) => l.text === text);
        if (idx >= 0) {
          matched.push(remaining[idx]);
          remaining.splice(idx, 1);
        } else {
          matched.push({
            id: nanoid(),
            text,
            renderId: target.id,
            createdAt: target.createdAt,
          });
        }
      }
      await updateProject((p) => ({
        ...p,
        scene: target.inputs.scene,
        masterPrompt: { draft: "", layers: matched },
      }));
      setActiveRenderId(target.id);
    },
    [renders, project, updateProject],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      project,
      gallery,
      renders,
      activeRenderId,
      isRendering,
      renderError,
      toasts,
      setInputMode,
      setSourceImage,
      clearSourceImage,
      setScene,
      setMasterDraft,
      addReferences,
      removeReference,
      resetAll,
      runRender,
      setActiveRender,
      revertToRender,
      pushToast,
      dismissToast,
    }),
    [
      project,
      gallery,
      renders,
      activeRenderId,
      isRendering,
      renderError,
      toasts,
      setInputMode,
      setSourceImage,
      clearSourceImage,
      setScene,
      setMasterDraft,
      addReferences,
      removeReference,
      resetAll,
      runRender,
      setActiveRender,
      revertToRender,
      pushToast,
      dismissToast,
    ],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
