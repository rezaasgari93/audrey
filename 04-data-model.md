# Audrey — Data Model

> **Status:** Draft v1.0 — handoff-ready.
> **Purpose:** Define the entities, their relationships, the IndexedDB schema, and the key lifecycle operations. Everything lives client-side (see [02-tech-stack.md](02-tech-stack-brainstorm.md)); there is no server database in v1.
> **Audience:** Claude Code. Types below are TypeScript and should land roughly as-is in `lib/types.ts` and `lib/db/schema.ts`.

---

## 1. Entity overview

```
Project ──< Gallery ──< Render
   │                       │
   ├──< Reference          └── (snapshots SceneSettings + prompt layers + mask)
   ├── SceneSettings (current)
   └── MasterPromptState (current + layer history)
```

- A **Project** is the top-level workspace. v1 ships with exactly one, but the schema supports many.
- A **Gallery** groups renders within a project. v1 ships with one ("Primary Gallery") per project.
- A **Render** is one output produced by one model call, with a full snapshot of the inputs that produced it.
- A **Reference** is an uploaded reference image, numbered `[REF NN]`.
- **SceneSettings** and **MasterPromptState** are the *current* editable state of the project (renders snapshot them at the moment of generation).

---

## 2. Types

```ts
// ---------- Enums / unions ----------

export type InputMode = 'source' | 'empty';        // 'map' reserved, not in v1
export type SourceMode = 'interior' | 'isometric'; // 'sectional-elevation' dropped in v1
export type CameraAngle =
  | 'original'
  | 'wide-angle'
  | 'corner-view'
  | 'eye-level'
  | 'detail-shot';
export type LightMode = 'daylight' | 'night' | 'golden-hour';
export type PeopleDensity = 'none' | 'subtle' | 'minor' | 'heavy';
export type OutputMode = 'photoreal' | 'sketch';
export type SketchMedium =
  | 'pencil'
  | 'fine-line-fountain-pen'
  | 'watercolour'
  | 'magic-marker';

// ---------- Scene settings ----------

export interface SceneSettings {
  sourceMode: SourceMode;     // default 'interior'
  cameraAngle: CameraAngle;   // default 'original'
  lightMode: LightMode;       // default 'daylight'
  people: PeopleDensity;      // default 'none'
}

// ---------- Reference ----------

export interface Reference {
  id: string;                 // nanoid, stable across re-numbering
  index: number;              // 1-based; drives the [REF NN] label, kept contiguous
  filename: string;
  blob: Blob;                 // full-quality original, stored in IndexedDB
  thumbnailDataUrl: string;   // small data URL for fast grid rendering
  width: number;
  height: number;
  addedAt: number;            // epoch ms
}

// ---------- Master prompt ----------

export interface PromptLayer {
  id: string;                 // nanoid
  text: string;               // the instruction added in this layer
  renderId: string;           // the render this layer produced
  createdAt: number;
}

export interface MasterPromptState {
  draft: string;              // current textarea contents (the next layer being composed)
  layers: PromptLayer[];      // confirmed layers, in chronological order
}

// ---------- Amendment mask ----------

export interface AmendmentMask {
  maskDataUrl: string;        // black/white PNG: white = edit region, black = preserve
  localPrompt: string;        // the localized instruction for the masked region
}

// ---------- Render ----------

export interface RenderInputsSnapshot {
  inputMode: InputMode;
  scene: SceneSettings;
  // The full ordered list of prompt-layer texts in effect AT render time
  promptLayers: string[];
  // The IDs (and resolved [REF NN] index) of references available at render time
  references: { id: string; index: number; filename: string }[];
  // Present only for amendment-mask renders
  amendment?: AmendmentMask;
  // Snapshot of the source image used (null in empty mode)
  sourceImageRef: string | null; // points to a stored blob key, see §3
}

export interface Render {
  id: string;                 // nanoid
  galleryId: string;
  createdAt: number;
  mode: OutputMode;
  sketchMedium?: SketchMedium; // present iff mode === 'sketch'
  inputs: RenderInputsSnapshot;
  outputBlob: Blob;           // the generated image (target 4K PNG)
  outputThumbnailDataUrl: string;
  model: {
    modelId: string;          // e.g. 'gemini-3-pro-image-preview'
    durationMs: number;
    thinkingUsed: boolean;
  };
}

// ---------- Gallery ----------

export interface Gallery {
  id: string;                 // nanoid
  projectId: string;
  name: string;               // e.g. 'Primary Gallery'
  createdAt: number;
  // Render order is by createdAt; renders are stored in their own table keyed by galleryId
}

// ---------- Project ----------

export interface Project {
  id: string;                 // nanoid
  name: string;               // e.g. 'Project Aether'
  createdAt: number;
  updatedAt: number;

  inputMode: InputMode;       // 'source' | 'empty'
  sourceImage: {
    blob: Blob;
    filename: string;
    width: number;
    height: number;
  } | null;                   // null in empty mode or before a source is chosen

  references: Reference[];    // ordered; index field is authoritative for [REF NN]
  scene: SceneSettings;
  masterPrompt: MasterPromptState;

  activeGalleryId: string;    // which gallery is currently shown
}
```

---

## 3. IndexedDB schema (Dexie)

Blobs are stored natively by IndexedDB — no base64 bloat needed. Use separate tables so a large render history doesn't force loading every blob to read project metadata.

```ts
// lib/db/schema.ts
import Dexie, { Table } from 'dexie';
import type { Project, Gallery, Render } from '@/lib/types';

export class AudreyDB extends Dexie {
  projects!: Table<Project, string>;
  galleries!: Table<Gallery, string>;
  renders!: Table<Render, string>;

  constructor() {
    super('audrey');
    this.version(1).stores({
      // Primary key first, then indexed fields
      projects: 'id, updatedAt',
      galleries: 'id, projectId',
      renders: 'id, galleryId, createdAt, mode',
    });
  }
}

export const db = new AudreyDB();
```

Notes:
- `references`, `scene`, and `masterPrompt` are stored *inside* the `Project` record (they're small and always loaded together). Reference blobs travel with the project record — acceptable for single-user scale; revisit only if a project accumulates dozens of large references.
- `renders` is its own table because the output blobs are large (4K PNGs) and we want to lazy-load them. The `HistoryStrip` reads only `id, createdAt, mode, outputThumbnailDataUrl` for the timeline; the full `outputBlob` is fetched on demand when a render is opened.
- The `sourceImageRef` in a render snapshot stores the source image bytes per-render (so reverting to an old render shows the source it actually used). To avoid duplicating an unchanged source across dozens of renders, keep a content-hash → blob map and have `sourceImageRef` hold the hash. *(Optimization; can be deferred — in v1 it's acceptable to store the source blob once on the Project and reference it by a sentinel string, since the source rarely changes mid-project.)*

---

## 4. Lifecycle operations

### 4.1 Create project
On first load, if no project exists, create one: `name: 'Project Aether'`, `inputMode: 'source'`, default `scene`, empty `references`, empty `masterPrompt`, one gallery `'Primary Gallery'`.

### 4.2 Set source image (Source mode)
Validate format (PNG/JPEG/WebP/HEIC) and size (≤ 25 MB). Convert HEIC → JPEG client-side. Store full blob + dimensions on the project. Enables the Render button.

### 4.3 Switch input mode
`source → empty`: confirm, then null out `sourceImage`. `empty → source`: prompt the user to pick a source. References, scene, and master prompt are preserved either way.

### 4.4 Add references
Append to `project.references`, assigning `index = currentMax + 1`. Generate a thumbnail. Enforce the 14-image model cap (block adding beyond 14; warn beyond 5).

### 4.5 Remove a reference
Delete it, then **re-number** the remaining references so `index` stays contiguous (1..N). Show a non-blocking warning that prior renders referencing the removed image can't be reproduced. (Existing render snapshots are immutable — they keep the reference metadata they captured.)

### 4.6 Compose + commit a prompt layer
The user types into `masterPrompt.draft`. On Render, the draft becomes a `PromptLayer` (linked to the new render's id), appended to `masterPrompt.layers`. Default: clear the draft after commit.

### 4.7 Produce a render
1. Build `RenderInputsSnapshot` from current project state (+ amendment mask if active).
2. Downsample source/references for transit (see [02-tech-stack.md](02-tech-stack-brainstorm.md) §8.1).
3. POST to `/api/render`.
4. On success: construct a `Render`, store `outputBlob` + thumbnail, append to the active gallery, set as active output, commit the prompt layer, bump `project.updatedAt`.
5. On failure: surface an error card with Retry; do not commit the prompt layer.

### 4.8 Revert to a prior render
Clicking a history thumbnail: set it as the active output, and roll `masterPrompt.layers` back to the set captured in that render's snapshot (`draft` cleared). Scene settings also revert to the snapshot. The reverted-from layers are not destroyed unless the user renders again from the reverted point (which forks history — see §4.9).

### 4.9 Forking
v1 keeps history linear. If the user reverts to render #3 of 7 and renders again, the simplest v1 behavior is to **append** the new render as #8 (history is append-only; reverting just changes the starting context). True branching trees are out of scope for v1. *(Flag: confirm this is acceptable; alternative is to truncate #4–#7, which loses work — append is safer.)*

### 4.10 Reset All
Confirmation modal → clear `sourceImage`, `references`, `masterPrompt`, reset `scene` to defaults, and (decision needed) either clear the gallery's renders or keep them. **Default: clear renders too**, since "Reset All" implies a clean slate; offer an "Export all first?" nudge in the confirmation modal.

### 4.11 Save / download
Take the active output blob (or the cropped region), ensure PNG, and trigger a download with the filename convention from [01-core-features.md](01-core-features.md) §4.4.

---

## 5. What the render API receives and returns

**Request body to `/api/render`** (validated with zod):

```ts
interface RenderRequest {
  inputMode: InputMode;
  mode: OutputMode;
  sketchMedium?: SketchMedium;
  scene: SceneSettings;
  promptLayers: string[];          // ordered; concatenated server-side
  sourceImageBase64: string | null; // downsampled for transit
  sourceMimeType: string | null;
  references: {
    index: number;
    base64: string;
    mimeType: string;
  }[];
  amendment?: {
    maskBase64: string;
    localPrompt: string;
  };
}
```

**Response body:**

```ts
interface RenderResponse {
  imageBase64: string;
  mimeType: string;       // e.g. 'image/png'
  durationMs: number;
  thinkingUsed: boolean;
}
```

The route is stateless — all history/layering context arrives in `promptLayers`. See [05-prompt-template.md](05-prompt-template.md) for how the request is turned into the actual model prompt.

---

## 6. Migration & versioning

- Dexie's `version(n).stores(...)` handles schema evolution. Start at `version(1)`.
- When Map / Life Engine / multi-project UI arrive, add a `version(2)` with new tables/fields and an upgrade function — no data loss.
- Reserve fields now to ease the future: an optional `mapImage` on `Project` and an optional `lifeEngineConfig` can be added later without breaking v1 records (IndexedDB is schemaless within a record).

---

## 7. Open data-model questions

1. **Source image per-render storage** (§3 note): store-once vs. content-hash map. v1 can store once on the project; revisit if reverting to renders with different sources becomes a real workflow.
2. **Forking behavior** (§4.9): confirm append-only is acceptable vs. branching.
3. **Reset All and render history** (§4.10): confirm renders are cleared (default) vs. preserved.
