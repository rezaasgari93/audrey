// Shared types — derived from docs/04-data-model.md.
// Persisted: Project, Gallery, Render (Dexie tables in lib/db/schema.ts).
// Transient: RenderRequest / RenderResponse (the /api/render contract).

import { z } from "zod";

// ---------- Enums / unions ----------

export type InputMode = "source" | "empty"; // 'map' reserved, not in v1
export type SourceMode = "interior" | "isometric"; // 'sectional-elevation' dropped in v1
export type CameraAngle =
  | "original"
  | "wide-angle"
  | "corner-view"
  | "eye-level"
  | "detail-shot";
export type LightMode = "daylight" | "night" | "golden-hour";
export type PeopleDensity = "none" | "subtle" | "minor" | "heavy";
export type OutputMode = "photoreal" | "sketch";
export type SketchMedium =
  | "pencil"
  | "fine-line-fountain-pen"
  | "watercolour"
  | "magic-marker";

// ---------- Scene settings ----------

export interface SceneSettings {
  sourceMode: SourceMode;
  cameraAngle: CameraAngle;
  lightMode: LightMode;
  people: PeopleDensity;
}

export const DEFAULT_SCENE: SceneSettings = {
  sourceMode: "interior",
  cameraAngle: "original",
  lightMode: "daylight",
  people: "none",
};

// ---------- Reference ----------

export interface Reference {
  id: string; // nanoid, stable across re-numbering
  index: number; // 1-based; drives the [REF NN] label, kept contiguous
  filename: string;
  blob: Blob; // full-quality original, stored in IndexedDB
  thumbnailDataUrl: string; // small data URL for fast grid rendering
  width: number;
  height: number;
  addedAt: number;
}

// ---------- Master prompt ----------

export interface PromptLayer {
  id: string;
  text: string;
  renderId: string;
  createdAt: number;
}

export interface MasterPromptState {
  draft: string;
  layers: PromptLayer[];
}

// ---------- Amendment mask ----------

export interface AmendmentMask {
  maskDataUrl: string; // black/white PNG: white = edit region, black = preserve
  localPrompt: string;
}

// ---------- Render ----------

export interface RenderInputsSnapshot {
  inputMode: InputMode;
  scene: SceneSettings;
  promptLayers: string[];
  // Stable IDs for each layer in `promptLayers`, same length and order.
  // Lets revertToRender match by identity rather than by text — see
  // lib/context/ProjectContext.tsx::revertToRender. Optional only to
  // tolerate any pre-existing snapshots that lack the field.
  promptLayerIds?: string[];
  references: { id: string; index: number; filename: string }[];
  amendment?: AmendmentMask;
  sourceImageRef: string | null;
}

export interface Render {
  id: string;
  galleryId: string;
  createdAt: number;
  mode: OutputMode;
  sketchMedium?: SketchMedium;
  inputs: RenderInputsSnapshot;
  outputBlob: Blob;
  outputThumbnailDataUrl: string;
  model: {
    modelId: string;
    durationMs: number;
    thinkingUsed: boolean;
  };
}

// ---------- Gallery ----------

export interface Gallery {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
}

// ---------- Project ----------

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  inputMode: InputMode;
  sourceImage: {
    blob: Blob;
    filename: string;
    width: number;
    height: number;
  } | null;

  references: Reference[];
  scene: SceneSettings;
  masterPrompt: MasterPromptState;

  activeGalleryId: string;
}

// ---------- /api/render contract ----------
// Doc 04 §5. The route is stateless — the client sends the full prompt-layer
// history plus all images needed for THIS call. The server concatenates layers
// into one user message; no chat state is maintained server-side.

const sceneSchema = z.object({
  sourceMode: z.enum(["interior", "isometric"]),
  cameraAngle: z.enum([
    "original",
    "wide-angle",
    "corner-view",
    "eye-level",
    "detail-shot",
  ]),
  lightMode: z.enum(["daylight", "night", "golden-hour"]),
  people: z.enum(["none", "subtle", "minor", "heavy"]),
});

const referenceForRequestSchema = z.object({
  index: z.number().int().positive(),
  base64: z.string().min(1),
  mimeType: z.string().min(1),
});

const amendmentSchema = z.object({
  maskBase64: z.string().min(1),
  localPrompt: z.string().min(1),
});

export const renderRequestSchema = z
  .object({
    inputMode: z.enum(["source", "empty"]),
    mode: z.enum(["photoreal", "sketch"]),
    sketchMedium: z
      .enum(["pencil", "fine-line-fountain-pen", "watercolour", "magic-marker"])
      .optional(),
    scene: sceneSchema,
    promptLayers: z.array(z.string()).min(1, "At least one prompt layer required"),
    sourceImageBase64: z.string().nullable(),
    sourceMimeType: z.string().nullable(),
    references: z.array(referenceForRequestSchema).max(14),
    amendment: amendmentSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "sketch" && !val.sketchMedium) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sketchMedium required when mode is 'sketch'",
        path: ["sketchMedium"],
      });
    }
    if (val.inputMode === "source" && !val.sourceImageBase64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sourceImageBase64 required in source mode",
        path: ["sourceImageBase64"],
      });
    }
    // Reference indices must form a contiguous 1..N set (no duplicates,
    // no holes, none above the array length or the model's 14-image cap).
    // The client renumbers on add/remove so this is defense-in-depth — but
    // making it explicit means a future bug in client code surfaces at the
    // API boundary instead of confusing the model.
    if (val.references.length > 0) {
      const seen = new Set<number>();
      for (const r of val.references) {
        if (r.index > 14) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Reference index ${r.index} exceeds the 14-image cap`,
            path: ["references"],
          });
        }
        if (r.index > val.references.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Reference index ${r.index} exceeds the count of attached references (${val.references.length})`,
            path: ["references"],
          });
        }
        if (seen.has(r.index)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate reference index ${r.index}`,
            path: ["references"],
          });
        }
        seen.add(r.index);
      }
    }
    if (val.amendment && val.inputMode !== "source") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "amendment is only valid in source (edit) mode",
        path: ["amendment"],
      });
    }
  });

export type RenderRequest = z.infer<typeof renderRequestSchema>;

export interface RenderResponse {
  imageBase64: string;
  mimeType: string;
  durationMs: number;
  thinkingUsed: boolean;
}

export interface RenderErrorResponse {
  error: string;
  detail?: string;
}
