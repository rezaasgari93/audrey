"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { nanoid } from "nanoid";

import {
  appendRender,
  clearGalleryRenders,
  getOrCreateDefaultProject,
  listRenders,
  saveProject,
} from "@/lib/db/projects";
import { blobForTransit } from "@/lib/images/downsample";
import { makeThumbnail, THUMBNAIL_MAX_EDGE } from "@/lib/images/upload";
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
  abortRender(): void;
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

// Master-prompt draft persistence is debounced — keystrokes are common,
// IndexedDB writes don't need to chase every one.
const DRAFT_DEBOUNCE_MS = 350;

// ---------- Provider ----------

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [renders, setRenders] = useState<Render[]>([]);
  const [activeRenderId, setActiveRenderId] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // projectRef mirrors `project` state but is updated synchronously on every
  // mutation so async callbacks (debounced writes, in-flight render
  // completion) always read the freshest value rather than a stale closure.
  const projectRef = useRef<Project | null>(null);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Debounced draft persistence — see setMasterDraft.
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<string | null>(null);

  // In-flight render cancellation — see runRender / abortRender.
  const renderAbortRef = useRef<AbortController | null>(null);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { project: p, gallery: g } = await getOrCreateDefaultProject();
      const rs = await listRenders(g.id);
      if (cancelled) return;
      setProject(p);
      projectRef.current = p;
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

  // Cancel any pending debounced draft flush without persisting it. Call
  // this immediately before any code path that intentionally clears or
  // overwrites `masterPrompt.draft` — otherwise a fast-completing render
  // (or resetAll) can be followed 350ms later by the debounced timer
  // firing and writing the stale pre-commit draft back to IDB, ghosting
  // the text back on the next mount.
  const cancelPendingDraftFlush = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    pendingDraftRef.current = null;
  }, []);

  // Flush any pending debounced draft when the provider unmounts.
  useEffect(
    () => () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      const pending = pendingDraftRef.current;
      const curr = projectRef.current;
      if (pending !== null && curr) {
        const next: Project = {
          ...curr,
          masterPrompt: { ...curr.masterPrompt, draft: pending },
        };
        void saveProject(next);
      }
    },
    [],
  );

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

  // Read latest project via ref, apply the mutation, persist. No closure
  // capture on `project`, no double-fire in StrictMode.
  const updateProject = useCallback(
    async (mutate: (p: Project) => Project): Promise<void> => {
      const curr = projectRef.current;
      if (!curr) return;
      const next = mutate(curr);
      projectRef.current = next;
      setProject(next);
      await saveProject(next);
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

  // Updates the draft in React state immediately (for snappy UI) but
  // debounces the IndexedDB write. The debounced flush reads the FRESHEST
  // project from projectRef so a render that completes mid-typing — which
  // appended a new PromptLayer — is not clobbered.
  const setMasterDraft = useCallback<ProjectContextValue["setMasterDraft"]>(
    (draft) => {
      const curr = projectRef.current;
      if (!curr) return;
      const next: Project = {
        ...curr,
        masterPrompt: { ...curr.masterPrompt, draft },
      };
      projectRef.current = next;
      setProject(next);

      pendingDraftRef.current = draft;
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        const pending = pendingDraftRef.current;
        const latest = projectRef.current;
        pendingDraftRef.current = null;
        draftTimerRef.current = null;
        if (pending === null || !latest) return;
        const toSave: Project = {
          ...latest,
          masterPrompt: { ...latest.masterPrompt, draft: pending },
        };
        void saveProject(toSave);
      }, DRAFT_DEBOUNCE_MS);
    },
    [],
  );

  const addReferences = useCallback<ProjectContextValue["addReferences"]>(
    async (uploads) => {
      let warnOverCap = 0;
      let totalAfter = 0;
      await updateProject((p) => {
        const startIndex = (p.references.at(-1)?.index ?? 0) + 1;
        const cap = 14;
        const remaining = Math.max(0, cap - p.references.length);
        const toAdd = uploads.slice(0, remaining);
        warnOverCap = uploads.length - toAdd.length;
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
        totalAfter = next.references.length;
        return next;
      });
      if (warnOverCap > 0) {
        pushToast(
          "warning",
          `Reference cap is 14 images; ${warnOverCap} skipped.`,
        );
      }
      if (totalAfter > 5) {
        pushToast(
          "info",
          `${totalAfter} references — fidelity may drop past 5.`,
        );
      }
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
    const galleryId = gallery?.id;
    // We're about to zero out masterPrompt.draft — drop any in-flight
    // debounced write so it can't resurrect the pre-reset text in IDB.
    cancelPendingDraftFlush();
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
    // Doc 04 §4.10: clearing renders is part of "Reset All". Physically
    // delete from Dexie so blob storage doesn't accumulate across resets.
    if (galleryId) await clearGalleryRenders(galleryId);
    setRenders([]);
    setActiveRenderId(null);
    pushToast("success", "Workspace reset.");
  }, [gallery, updateProject, pushToast, cancelPendingDraftFlush]);

  // ---------- Render orchestration ----------

  const runRender = useCallback<ProjectContextValue["runRender"]>(
    async ({ mode, sketchMedium, amendment }) => {
      const currentProject = projectRef.current;
      if (!currentProject || !gallery) return;
      if (isRendering) return;

      const draftText = currentProject.masterPrompt.draft.trim();
      // Captured at render-start and used later when building the snapshot's
      // promptLayerIds. Safe because nothing else mutates masterPrompt.layers
      // while isRendering is true (the isRendering gate above blocks a second
      // runRender, and no other code path appends layers). If that invariant
      // ever changes, this needs to become a fresh read at commit time.
      const existingLayers = currentProject.masterPrompt.layers;
      const allLayerTexts = [...existingLayers.map((l) => l.text)];
      if (draftText) allLayerTexts.push(draftText);
      if (allLayerTexts.length === 0) {
        pushToast(
          "warning",
          "Write something in the master prompt before rendering.",
        );
        return;
      }
      if (currentProject.inputMode === "source" && !currentProject.sourceImage) {
        pushToast("warning", "Choose a source image first.");
        return;
      }

      const abortController = new AbortController();
      renderAbortRef.current = abortController;
      setIsRendering(true);
      setRenderError(null);

      try {
        let sourceImageBase64: string | null = null;
        let sourceMimeType: string | null = null;
        if (currentProject.inputMode === "source" && currentProject.sourceImage) {
          const t = await blobForTransit(currentProject.sourceImage.blob);
          sourceImageBase64 = t.base64;
          sourceMimeType = t.mimeType;
        }
        const refs = await Promise.all(
          currentProject.references.map(async (r) => {
            const t = await blobForTransit(r.blob);
            return { index: r.index, base64: t.base64, mimeType: t.mimeType };
          }),
        );

        const amendmentForWire = amendment
          ? {
              maskBase64: stripDataUrlPrefix(amendment.maskDataUrl),
              localPrompt: amendment.localPrompt,
            }
          : undefined;

        const body: RenderRequest = {
          inputMode: currentProject.inputMode,
          mode,
          sketchMedium,
          scene: currentProject.scene,
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
          signal: abortController.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          const msg =
            errBody?.error ??
            (res.status === 504 ? "Render timed out." : "Render failed.");
          const detail = errBody?.detail ? ` (${errBody.detail})` : "";
          throw new Error(`${msg}${detail}`);
        }

        const missingHeader = res.headers.get("x-audrey-missing-refs");
        if (missingHeader) {
          const indices = missingHeader
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const word = indices.length === 1 ? "Reference" : "References";
          const verb = indices.length === 1 ? "was" : "were";
          pushToast(
            "warning",
            `${word} ${indices.join(", ")} ${verb} missing and skipped in the prompt.`,
          );
        }

        const data = (await res.json()) as RenderResponse;
        const outputBlob = base64ToBlob(data.imageBase64, data.mimeType);
        const outputThumbnailDataUrl = await makeThumbnail(
          outputBlob,
          THUMBNAIL_MAX_EDGE,
        );

        // Commit prompt layer: the just-typed draft becomes a layer attached
        // to the new render. The full list of layer IDs that produced this
        // render is captured in promptLayerIds for robust revert.
        const renderId = nanoid();
        const newLayer: PromptLayer | null = draftText
          ? {
              id: nanoid(),
              text: draftText,
              renderId,
              createdAt: Date.now(),
            }
          : null;

        const promptLayerIds = [
          ...existingLayers.map((l) => l.id),
          ...(newLayer ? [newLayer.id] : []),
        ];

        const snapshot: RenderInputsSnapshot = {
          inputMode: currentProject.inputMode,
          scene: currentProject.scene,
          promptLayers: allLayerTexts,
          promptLayerIds,
          references: currentProject.references.map((r) => ({
            id: r.id,
            index: r.index,
            filename: r.filename,
          })),
          amendment,
          sourceImageRef: currentProject.sourceImage ? "current-source" : null,
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
        // Drop any in-flight debounced draft write before the commit
        // clears masterPrompt.draft — otherwise a 350ms-late flush can
        // re-write the pre-render draft to IDB and it ghosts back on
        // next mount.
        cancelPendingDraftFlush();
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
        if (e instanceof Error && e.name === "AbortError") {
          pushToast("info", "Render cancelled.");
        } else {
          const msg =
            e instanceof Error ? e.message : "Unknown error during render.";
          setRenderError(msg);
          pushToast("error", msg);
        }
      } finally {
        renderAbortRef.current = null;
        setIsRendering(false);
      }
    },
    [gallery, isRendering, pushToast, updateProject, cancelPendingDraftFlush],
  );

  const abortRender = useCallback<ProjectContextValue["abortRender"]>(() => {
    renderAbortRef.current?.abort();
  }, []);

  const setActiveRender = useCallback<ProjectContextValue["setActiveRender"]>(
    (id) => setActiveRenderId(id),
    [],
  );

  // Roll the master-prompt layers and scene back to the snapshot stored on
  // the target render. Prefer matching by stable layer ID; fall back to
  // matching by text for any snapshot that lacks IDs (defensive — current
  // code always populates them).
  const revertToRender = useCallback<ProjectContextValue["revertToRender"]>(
    async (id) => {
      const target = renders.find((r) => r.id === id);
      const currentProject = projectRef.current;
      if (!target || !currentProject) return;

      const snapshotIds = target.inputs.promptLayerIds;
      const snapshotTexts = target.inputs.promptLayers;
      const matched: PromptLayer[] = [];

      if (snapshotIds && snapshotIds.length === snapshotTexts.length) {
        const byId = new Map(
          currentProject.masterPrompt.layers.map((l) => [l.id, l]),
        );
        for (let i = 0; i < snapshotIds.length; i++) {
          const existing = byId.get(snapshotIds[i]);
          matched.push(
            existing ?? {
              id: snapshotIds[i],
              text: snapshotTexts[i],
              renderId: target.id,
              createdAt: target.createdAt,
            },
          );
        }
      } else {
        // Legacy / missing IDs: match by text (first occurrence consumes).
        // When no existing layer matches, the fabricated replacement is
        // stamped with the *target* render's id/createdAt rather than the
        // original layer's — that provenance is unrecoverable from a
        // snapshot that only stored text. Cosmetic (round-trip of text
        // and ordering is preserved); current code always populates
        // promptLayerIds so this branch is a defensive fallback only.
        const remaining = [...currentProject.masterPrompt.layers];
        for (const text of snapshotTexts) {
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
      }

      await updateProject((p) => ({
        ...p,
        scene: target.inputs.scene,
        masterPrompt: { draft: "", layers: matched },
      }));
      setActiveRenderId(target.id);
    },
    [renders, updateProject],
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
      abortRender,
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
      abortRender,
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
