# Audrey — Core Features Specification

> **Source:** Reza's written requirements + screenshots of the existing prototype hosted at `ai-studio-210126-178952315902.us-west1.run.app` ("Project Aether" is an example project shown in its UI) + Reza's clarification on the two-mode pattern.
> **Status:** Draft v0.3 — handoff-ready. Most open questions resolved with locked defaults (§9). The remaining unknowns are flagged at the top.
> **Purpose:** Define every input, output, and interaction surface of the app for v1 implementation.

---

## 0. Status of the spec

**Locked for v1.** Reza has signed off on (or this draft assumes, with override welcome) every default in §9.

**Still genuinely unknown** and intentionally cut from v1 unless Reza resolves them:

- **Map** input button — purpose undefined. Not implemented in v1; the button is hidden.
- **Life Engine** top tab — purpose undefined. Tab is hidden in v1.

The product is called **Audrey**. "Project Aether" is the name of an example project, not the product.

---

## 1. The core idea (one paragraph)

Audrey is a single-user web app for iterating on architectural images using Google's Nano Banana Pro (Gemini 3 Pro Image). It supports two complementary workflows, both powered by the same model:

1. **Edit an existing image** — upload an interior/exterior photo and modify it through layered natural-language prompts, reference images, and structured controls (camera angle, lighting, occupancy). The model changes only what the user asks; the rest of the scene is preserved.
2. **Generate from scratch** — describe a scene in words (with optional reference images for materials/finishes/mood), and the model produces it.

Outputs come in two visual flavours — photorealistic **Render** or artistic **Sketch** (multiple mediums) — with comparison, region-masked amendments, cropping, and high-resolution save.

---

## 2. Layout

The prototype uses a three-region layout. Audrey v1 keeps it.

| Region                     | Contents                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Left column** (input)    | Source / Empty input-mode buttons + Reset All, Master Prompt, Reference Gallery, Scene panel, Learning & Improvement panel. |
| **Center column** (output) | Top tab bar (Comparison / Amendment Mask / Crop Image), output canvas, bottom Render Output Pipeline.                       |
| **Top-right label**        | Active project + gallery indicator (e.g., "Project Aether — Primary Gallery").                                              |

Map button and Life Engine tab are present in the codebase but hidden behind a feature flag until their behavior is defined.

---

## 3. Input Panel (left column)

### 3.1 Source / Empty + Reset All

A row of two input-mode buttons at the top of the left column with a **Reset All** action beneath.

| Button       | Purpose                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Source**   | Opens the OS file picker to choose a base image. The app then operates in **edit mode**: every render takes the source image as input and modifies it according to the prompt + scene settings.                    |
| **Empty**    | Switches to **generate mode**: no source image. Every render is generated from scratch using the master prompt, reference gallery, and scene settings alone.                                                       |
| ~~Map~~      | *Hidden in v1.* Reserved for a future floorplan-input feature. Codebase keeps the button behind a feature flag.                                                                                                    |
| **Reset All** *(red text)* | Clears all inputs and outputs in the current project, returning the workspace to its initial empty state. Triggers a confirmation modal because it's destructive. |

**Active input mode** is part of project state. Switching between Source and Empty mid-project clears the source image (with confirmation) but preserves the master prompt, references, and scene settings.

**Accepted image formats:** PNG, JPEG, WebP, HEIC. **Max file size:** 25 MB per image (covers both source and reference uploads).

### 3.2 Master Prompt

- **Control:** Multi-line text area.
- **Placeholder text (from prototype):** *"Describe materials, textures, and lighting. Quote [REF 01] to link reference images."*
- **Reference syntax:** the user writes `[REF 01]`, `[REF 02]`, etc., to refer to images in the Reference Gallery. The server-side prompt-template layer translates these into natural-language references when calling the model (see [05-prompt-template.md](05-prompt-template.md)).
- **Critical constraints surfaced to the model with every call:**
  - **Preserve fundamentals.** Do not alter scene geometry, room layout, structural elements, window/door positions, or any aspect of the source image that the prompt does not explicitly request.
  - **Preserve camera angle** unless the user explicitly changes it via the Camera Angle control (§3.4.2).
  - Execute only what the prompt specifies — nothing more.
  - *(Edit mode only; in Empty mode these don't apply because there's no source to preserve.)*
- **Layering / revision behavior:**
  - Each render is a turn in a multi-turn chat session (per project) with the model. The model retains context from prior turns.
  - The textarea always holds the *current* layer of prompt additions. Once the user clicks Render, that layer becomes part of the project's prompt history and the textarea clears (or remains as the last instruction — see §9 default).
  - A **Prompt History** panel below the textarea shows each prior layer with its timestamp and the render it produced. Clicking a layer reverts to that render and the prompt history up to that point.

### 3.3 Reference Gallery

- **Control:** Section labeled "Reference Gallery" with an **Add Refs** link. Multi-select file picker.
- **Display:** Thumbnail grid. Each tile shows its `[REF NN]` identifier prominently. Hover/long-press to preview at full size; kebab menu to remove.
- **Behavior:**
  - References are numbered in the order they're added (`[REF 01]`, `[REF 02]`, …). Removing a reference re-numbers subsequent ones to keep the sequence contiguous — and the app warns the user that prior renders that referenced the removed image won't be reproducible.
  - **Click-to-insert:** clicking a thumbnail inserts its `[REF NN]` token into the Master Prompt at the cursor.
  - References persist across renders within a project, up to the model's native cap of **14 input images per call**. Beyond 5 references, the app shows an inline warning that fidelity may degrade.

### 3.4 Scene Panel

A grouped panel labeled **Scene**.

#### 3.4.1 Source Mode

| Mode          | Description                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| **Interior**  | First-person perspective inside the interior/exterior setting. Default.                      |
| **Isometric** | Bird's-eye projection where horizontal planes are drawn at 30° from the flat baseline plane. |

**Sectional Elevation** is **dropped from v1** (not in prototype, low priority).

#### 3.4.2 Camera Angle

The only input allowed to override the "preserve camera angle" constraint.

| Option         | Description                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| **Original**   | Keep the camera position and lens of the source image. Default.              |
| **Wide angle** | Wider field of view from a similar position.                                 |
| **Corner view**| Camera positioned in a corner of the room, looking diagonally across.        |
| **Eye level**  | Camera at standing eye-level with natural framing.                           |
| **Detail shot**| Close-up framing on a focal element. The subject is inferred from the Master Prompt (and from the Amendment Mask region if one is active). |

#### 3.4.3 Light Mode

| Option         | Description                                              |
| -------------- | -------------------------------------------------------- |
| **Daylight**   | Bright natural daylight, typical of midday. Default.     |
| **Night**      | Dark exterior, artificial interior lighting active.      |
| **Golden hour**| Warm, low-angle natural light typical of sunrise/sunset. |

The model is expected to identify both natural and artificial light sources in the source image and apply the selected condition realistically.

#### 3.4.4 People

| Option       | Description                                        |
| ------------ | -------------------------------------------------- |
| **None**     | Empty space, no people. Default.                   |
| **Subtle**   | A barely-noticeable presence — one or two figures. |
| **Minor**    | A modest, naturally populated scene.               |
| **Heavy**    | Densely populated, busy environment.               |

To specify the *type* of people (e.g., "school kids," "scientists"), the user includes that detail in the Master Prompt — no separate field.

### 3.5 Learning & Improvement

- **Control:** Multi-line text area with placeholder *"App feedback for model development..."* and a **Submit Feedback** button.
- **Behavior in v1:** clicking Submit Feedback opens the user's default mail client via a `mailto:` link with the feedback text pre-filled in the body and a subject line of *"Audrey feedback — [project name]"*. The recipient email is configurable via an environment variable.

---

## 4. Output Area (center column)

### 4.1 Top Tab Bar

A pill-style tab bar with three visible tabs in v1 (Life Engine is hidden until defined).

| Tab                | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| **Comparison**     | Default view — compare the source image to the active output. See §4.1.1.     |
| **Amendment Mask** | Region-specific edits via stylus mask. See §4.1.2.                            |
| **Crop Image**     | Crop the active output. See §4.1.3.                                           |

#### 4.1.1 Comparison

- **Interaction:** drag-handle slider in the center of the output area, dividing source (left) and output (right). The user drags the handle horizontally to reveal more or less of each. Works with mouse and stylus.
- **Scope:** in v1, comparison is always source-vs-current-output. Comparing against prior renders is not in v1.
- **In Empty mode** (no source image), Comparison defaults to showing the active output full-width with a small history strip beneath.

#### 4.1.2 Amendment Mask

- **Activation:** tapping the tab swaps the output area into mask-drawing mode. The current output is shown semi-transparent as a backdrop.
- **Drawing:** the user draws a freehand region with a stylus or mouse. The stroke creates a soft-edge mask. A toolbar provides: undo last stroke, clear mask, adjust brush size.
- **Local prompt:** an inline text field below the canvas accepts a short localized instruction (e.g., *"add a light here"*, *"change this chair to [REF 03]"*). Render is disabled until both a mask exists *and* a local prompt has been written.
- **Per render:** one mask at a time. To make multiple region-targeted edits, the user renders, then draws a new mask on the new output.
- **Mask persistence:** masks are cleared from the canvas after a successful render but stored on the resulting Render record (so the user can see what they edited).

#### 4.1.3 Crop Image

- **Behavior:** purely client-side. The user adjusts a rectangular crop frame on the active output. Saving (via Save Render / Save Sketch) writes only the cropped region.
- **Scope:** cropping affects the *exported* image, not the project's underlying source or future renders.

### 4.2 Output Canvas

- Displays the source image (Comparison mode default before any render exists), the active output, or a placeholder when neither is loaded.
- Loading state during model calls: skeleton shimmer plus a progress label ("Thinking…", "Rendering…", "Finalizing…").
- Error state: inline error card with the failure message and a Retry button.

### 4.3 Render Output Pipeline (bottom action bar)

A single horizontal action bar at the bottom, labeled **Render Output Pipeline**.

#### 4.3.1 Render (Photoreal)

- **Control:** large primary button labeled **Render (Photoreal)**.
- **Disabled when:**
  - In Source mode and no source image is loaded.
  - In Amendment Mask sub-tab and either the mask is empty or the local prompt is empty.
  - A render is in flight.
- **Behavior:** sends all current inputs to Nano Banana Pro and returns a photorealistic, magazine-quality image. Lifelike textures, physically plausible lighting, accurate spatial relationships, sharp focus.

#### 4.3.2 Sketch sub-mode

Four medium buttons to the right of Render, under the label **Sketch:**

| Button                     | Medium                                                       |
| -------------------------- | ------------------------------------------------------------ |
| **Pencil**                 | Graphite pencil sketch.                                      |
| **Fine-line fountain pen** | Crisp ink-line drawing.                                      |
| **Watercolour**            | Loose washes over light line work.                           |
| **Magic marker**           | Bold marker rendering with confident strokes.                |

Clicking a medium does two things:

1. Enters **sketch sub-mode** (visible: a **Close Sketch Mode** link appears in the top-right of the pipeline bar, and **Save Render** is replaced by **Save Sketch**).
2. Immediately triggers a render in that medium.

Subsequent clicks of other mediums while in sketch mode re-render in the new medium. **Close Sketch Mode** returns the bar to the photoreal default; the most recent sketch output is preserved in history.

### 4.4 Save (Render / Sketch)

- **Behavior:** downloads the active output (or the cropped region, if a crop is active) to the user's local file system.
- **Format:** PNG.
- **Resolution:** Nano Banana Pro's native 4K (4096 × 4096) when available; otherwise the model's returned resolution.
- **Filename:** `audrey_<project-slug>_<timestamp>_<mode>.png` — e.g., `audrey_project-aether_2026-05-20T18-45_render.png`.

---

## 5. Project / Gallery Concept

**v1 ships with a single project containing a single gallery** ("Primary Gallery"). The top-right label is informational, not interactive. The data model (see [04-data-model.md](04-data-model.md)) is structured to accommodate multiple projects and galleries in the future without migration; project/gallery switching UI is not implemented in v1.

Per the single-user, easiest-architecture decision in [02-tech-stack.md](02-tech-stack.md), all project data — including source image, references, prompt history, scene settings, and the full render/sketch history — is persisted in browser **IndexedDB**. No server-side database in v1.

---

## 6. Render History

- Every successful render (photoreal or sketch) is appended to the active gallery.
- Each render record captures the full input state at the time it was produced: scene settings, master prompt layers up to that point, active references, and any amendment mask.
- A horizontal history strip (timeline) below the output canvas shows thumbnails of prior renders. Clicking a thumbnail loads that render as the active output (the project state — including the master prompt history — reverts to its state at that render).
- **Both render and sketch outputs coexist in history**, distinguished by a small mode badge on each thumbnail.

---

## 7. Cross-Cutting Constraints

Apply to every render the system produces:

1. **Faithful modification.** The model must change only what the prompt (or amendment mask) instructs. All other aspects of the source image are preserved.
2. **Camera angle lock.** The source image's viewpoint is preserved unless the user explicitly changes it via the Camera Angle control (§3.4.2).
3. **Reference-image grounding.** When the master prompt names a reference (`[REF NN]`), the model uses that image as the authoritative source for the named element.
4. **Iteration is layered, not destructive.** Subsequent prompts add to the master prompt; the model reasons about cumulative intent.
5. **Disabled states are explicit.** Actions that aren't yet valid are visibly disabled, not silently broken.
6. **Mode-aware constraints.** In Empty mode, constraints (1) and (2) don't apply (no source to preserve). The model is freed to generate the scene as described.

---

## 8. Open Questions (still unresolved)

Down to two:

1. **What does the Map button do?** Hidden in v1.
2. **What is Life Engine?** Hidden in v1.

Both are reserved in the data model and codebase, so adding them later is non-breaking.

---

## 9. Locked Defaults (Claude's calls, override anytime)

These were open in v0.2; they're now locked for v1 with a one-line rationale. Reza can override any of them and I'll update.

| Topic                                            | v1 decision                                                                 | Rationale                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Product name                                     | **Audrey**                                                                  | Established working name; codebase folder is `audrey/`.    |
| Sectional Elevation source mode                  | **Dropped**                                                                 | Not in prototype; low priority.                            |
| "Type of people" custom field                    | **Dropped**; users include in Master Prompt                                 | Not in prototype; Master Prompt is expressive enough.      |
| Submit Feedback destination                      | **`mailto:` link**, recipient in env var                                    | Simplest single-user-friendly delivery.                    |
| Crop Image behavior                              | **Client-side only**                                                        | Avoids needless model calls; faster, free.                 |
| Crop affects future renders?                     | **No** — crop is export-only                                                | Predictable, no destructive side effects.                  |
| Save Render button in photoreal mode             | **Yes**, mirror of Save Sketch                                              | Obvious symmetry.                                          |
| Projects/galleries v1 scope                      | **Single project, single gallery**; data model ready for multi              | Pragmatic; one less UI surface to build.                   |
| Accepted image formats / max size                | **PNG/JPEG/WebP/HEIC, 25 MB**                                               | Standard, generous.                                        |
| Undoing a prompt layer                           | **Revert via clicking a prior render in the history strip**                 | Single, clear mechanism.                                   |
| Click reference thumbnail                        | **Inserts `[REF NN]` at the Master Prompt cursor**                          | Lowest-friction UX.                                        |
| Source-mode/source-image conflict                | **Soft warning**, user can proceed                                          | Don't block creative iteration.                            |
| Detail shot subject selection                    | **Inferred from Master Prompt (and active mask if any)**                    | No new UI needed.                                          |
| Light Mode "Original" option                     | **Not added in v1**                                                         | KISS; user can phrase in prompt if needed.                 |
| Render + Sketch coexistence in history           | **Both kept, distinguished by mode badge**                                  | More flexible for iteration.                               |
| Comparison interaction                           | **Drag-handle slider**                                                      | Works on desktop + tablet stylus.                          |
| Comparison vs. prior renders                     | **Source-vs-output only in v1**                                             | Simpler; can extend later.                                 |
| Multiple amendments per render                   | **One at a time**                                                           | Matches API native pattern.                                |
| Amendment mask persistence on canvas             | **Cleared after render; stored on the Render record**                       | Clean UX; full history retained.                           |
| Default save format / resolution                 | **PNG at 4K**, filename `audrey_<project>_<ts>_<mode>.png`                 | High quality, predictable.                                 |
| Where reference numbering goes when one is removed| **Re-numbers to stay contiguous**; warning shown                            | Avoids `[REF 02]` mysteriously meaning nothing.            |

---

## 10. Out of Scope for v1

- Map button behavior (deferred).
- Life Engine (deferred).
- Multi-project / multi-gallery UI (data model ready, UI not built).
- Comparison against prior renders.
- Multi-region amendments in a single render.
- Account / auth / multi-user (single-user app per [02-tech-stack.md](02-tech-stack.md)).
- Cloud sync of projects (everything lives in browser IndexedDB).
- Mobile phone layout (desktop + tablet only).
- Native upscaler (model's 4K output is sufficient).
- Animation / video output.

---

## Changelog

- **v0.3** — Resolved EMPTY mode per Reza's clarification (generate-from-scratch). Locked product name to Audrey. Hid Map and Life Engine in v1. Locked defaults for 22 prior open questions. Added §6 Render History as its own concern. Updated cross-cutting constraints to be mode-aware. Specified file formats, mask persistence, save format/filename.
- **v0.2** — Integrated prototype screenshots. Added Map / Empty / Reset All buttons, Learning & Improvement panel, Crop Image and Life Engine tabs, project/gallery concept, `[REF NN]` reference syntax, Magic Marker sketch medium, fine-line fountain pen renaming, sketch sub-mode toggle, disabled-state for Render. People labels updated (Subtle/Minor replace minimal/average). Renamed Mark-up Mode → Amendment Mask.
- **v0.1** — Initial enrichment from Reza's written input list.
