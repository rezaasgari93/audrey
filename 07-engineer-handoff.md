# Audrey — Engineer Handoff

> **You are picking this project up cold.** Read `00-README.md` and docs `01`–`06` first; they are the product spec and are still authoritative. Then read this file. Nothing here overrides the specs — it just tells you *what has been built*, *what to build next*, and *what to be careful of*.
>
> Update this file whenever you complete a milestone or discover a new landmine. It is meant to age with the code.

---

## 1. TL;DR

- Stack is wired and typechecks (`npm run typecheck`). Milestones 1–4 of the build order in `00-README.md` are code-complete: Dexie storage, `/api/render`, prompt-template, Input Panel, Output Area, Comparison slider, history strip, save-as-4K-PNG, render orchestration + revert.
- **The end-to-end path has not been exercised with a real API key.** Before you build anything new, satisfy Milestone 0 below (sanity check + smoke).
- Amendment Mask, Crop Image, and the Sketch sub-mode are **stubbed** (visible tabs/labels, no logic). Those are Milestones 5–7.
- Feature-flagged out (do not build): Map input, Life Engine tab. Reserve fields exist in the data model.
- The current branch is `feat/milestone-1-4-scaffold`. Two commits on top of `main`: initial scaffold + a PR1-review pass. Open a new branch per milestone.

---

## 2. Ground truth for "what's done"

### 2.1 Built and working

| Area | Files | Notes |
|---|---|---|
| App shell / layout | `app/layout.tsx`, `app/page.tsx`, `components/workspace/Workspace.tsx` | Two-column grid (`360px` input, `1fr` output), header, Toaster. |
| Persistence | `lib/db/schema.ts`, `lib/db/projects.ts` | Dexie v1 tables `projects`, `galleries`, `renders`. Lazy-instantiated so it's server-safe. Auto-creates "Project Aether / Primary Gallery" on first load. |
| Shared types + wire contract | `lib/types.ts` | All entity types from doc 04. Zod schema for `/api/render` validates contiguous ref indices, mode/medium coupling, source-image presence, amendment-in-edit-mode-only. |
| Render route | `app/api/render/route.ts` | POST-only, `runtime = "nodejs"`, `maxDuration = 60`. Returns `x-audrey-missing-refs` header when tokens dropped. Requests `imageSize: "4K"`. |
| Gemini client | `lib/gemini/client.ts` | Singleton, throws a helpful error when `GEMINI_API_KEY` is missing. |
| Prompt template | `lib/gemini/prompt-template.ts` | Doc 05 §1–7 implemented verbatim. `[REF NN]` regex is tolerant (`[REF01]`, `[ref-1]`, `[Ref 1]`, etc.). Lazy-attaches only referenced images. |
| Upload pipeline | `lib/images/upload.ts` | Validates MIME+extension, ≤25 MB, HEIC → JPEG via dynamic `heic2any` import, makes thumbnail (256 px edge). |
| Transit downsampler | `lib/images/downsample.ts` | Caps at 4096 px edge and re-encodes PNGs over 1.5 MB to JPEG q0.9 to stay under Vercel's 4.5 MB request cap. |
| Download helper | `lib/images/download.ts` | `audrey_<slug>_<YYYY-MM-DDTHH-mm>_<mode>.png` per doc 01 §4.4. |
| Project state / render orchestration | `lib/context/ProjectContext.tsx` | Single React context. Debounced draft persistence (350 ms). Renders via `AbortController`. Revert uses stable layer IDs (`promptLayerIds` in the snapshot) with a text-match fallback. |
| Input Panel | `components/workspace/*.tsx` | Source/Empty/Reset, MasterPrompt + PromptHistory, ReferenceGallery (click-to-insert `[REF NN]`, renumbers on remove), ScenePanel (Source Mode / Camera / Light / People pills), FeedbackPanel (`mailto:` with `NEXT_PUBLIC_FEEDBACK_RECIPIENT_EMAIL`). |
| Output Area (partial) | `components/output/*.tsx` | TabBar (3 tabs), Comparison slider (both-images clip-path), HistoryStrip (mode badge, revert on click), PipelineBar (Render Photoreal + Stop + Sketch sub-mode with 4 mediums + Close Sketch Mode + Save Render/Sketch). |
| UI primitives | `components/ui/Button.tsx`, `ConfirmModal.tsx`, `Toaster.tsx` | Confirm modal handles Esc/Enter and click-outside; Toaster auto-dismisses non-errors after 4.5 s. |
| Sanity check script | `scripts/sanity-check.ts` | Two-test harness: (1) does `preserve everything else` hold; (2) does the model respect a B/W mask. **Not run yet.** |

### 2.2 Stubbed (placeholder text, no logic)

| Feature | Where | Milestone that finishes it |
|---|---|---|
| Amendment Mask | `components/output/OutputArea.tsx` `tab === "amendment-mask"` branch | M6 |
| Crop Image | Same file, `crop-image` branch | M7 |

### 2.3 Deferred by design (do not build without a spec update)

- **Map** input button — hidden. Room reserved in the `InputMode` union comment.
- **Life Engine** top tab — hidden. Room reserved in the tab enum by absence.
- Multi-project / multi-gallery UI.
- Comparison vs. prior renders.
- Branching render history (append-only in v1, see doc 04 §4.9).

### 2.4 Locked-in decisions from the PR1 review

Do not undo these without a reason:

- **`projectRef` mirrors `project` state** in `ProjectContext`. Every async callback (debounced draft flush, render completion) reads the freshest value from the ref, not a closure. Prevents StrictMode double-fires and clobber-on-write when a render completes mid-typing.
- **Revert matches by stable layer ID** (`promptLayerIds` in `RenderInputsSnapshot`), falling back to text match for snapshots that predate the field. Older code matched by text and got confused by duplicate identical layers.
- **`resetAll` physically deletes renders from Dexie** (`clearGalleryRenders`) so blob storage doesn't leak across resets. Doc 04 §4.10 default.
- **Zod schema enforces contiguous 1..N reference indices** as defense-in-depth against a client bug renumbering incorrectly.
- **Transit downsampler has both a pixel cap and a PNG byte ceiling.** A 4K PNG that's within the pixel cap can still be 15–25 MB — base64-inflated that blows Vercel's 4.5 MB cap. See `lib/images/downsample.ts` for the two thresholds.
- **`next.config.ts` has no body-size knob.** The `experimental.serverActions.bodySizeLimit` option only affects Server Actions, not route handlers. The client-side downsampler is the *only* lever we have.

---

## 3. What to build next (milestone by milestone)

Work top-down. Each milestone has an **entry criterion** you must satisfy before starting and an **acceptance check** you must satisfy before opening a PR.

### Milestone 0 — Confirm the model behaves (blocks everything else)

**Entry:** you have a `GEMINI_API_KEY`.

Do:

1. Drop a real interior photo at `scripts/fixtures/source.jpg` (~1024–2048 px on the long edge, JPEG).
2. `GEMINI_API_KEY=... npm run sanity-check`.
3. Open `scripts/sanity-out/test1-floor-swap.*` next to the source. Only the floor should differ. If walls / ceiling / framing / lighting drift visibly, **flag Reza** — this is the "faithful modification" promise and doc 05 §2.1 may need strengthening (e.g. "preserve everything else" + sending the source twice — one labeled "reference for unchanged areas").
4. Open `scripts/sanity-out/test2-mask-honored.*`. Changes must be confined to the left third (the white-mask region). If they leak, the mask polarity or format is wrong — **flag Reza**.
5. Then run the app: `npm run dev`, open http://localhost:3000, upload a source, write a prompt, click Render (Photoreal), Save. Ensure:
   - Loading state appears (currently a single "Rendering…" pulse — that's expected until you polish it in M8).
   - The result appears in the canvas and the history strip.
   - Save downloads an `audrey_project-aether_…_render.png` around a few MB.
   - Reload the tab; the render is still there (Dexie).

**Acceptance:** either the model behaves as claimed and you can proceed, or you've filed clear notes for Reza about how it drifts.

### Milestone 5 — Sketch sub-mode — DONE

Landed in `feat/m5-sketch-submode`. Local `sketchMode: SketchMedium | null` in `PipelineBar.tsx` (transient, not persisted). Four medium buttons in doc 01 §4.3.2 order fire `runRender({ mode: "sketch", sketchMedium })` and highlight the active medium. Clicking Render (Photoreal) exits the sub-mode. Close Sketch Mode link appears while in sub-mode. Save label swaps Render ↔ Sketch based on sub-mode; filename mode still derives from `activeRender.mode` for correctness. History badge already worked (`HistoryStrip.tsx:20`).

Not yet validated against the real API — needs M0 first to see the four mediums render as visibly distinct.

### Milestone 6 — Amendment Mask

**Entry:** M0 done. Sanity check confirmed the mask is respected (test 2). If it didn't, resolve with Reza before building the UI.

Do:

1. Build `components/output/AmendmentMaskCanvas.tsx`:
   - Backdrop: the active output rendered at ~35 % opacity (per doc 01 §4.1.2 — "shown semi-transparent"). If there's no active output yet, use the source image; if neither exists, show a placeholder saying to render first.
   - Overlay: a `<canvas>` sized to the display box, pointer-events enabled. Strokes accumulate on the canvas in white with a configurable soft-edge brush (start with 40 px radius, `globalAlpha` around 0.9, `filter: blur(2px)` — tune during M9).
   - Toolbar: brush-size slider, undo-last-stroke, clear-mask. Undo is easiest by keeping a stack of `ImageData` snapshots or an array of stroke paths.
   - Inline text field beneath the canvas: local prompt. Doc 01 §4.1.2 — the Render button is disabled until *both* mask has strokes *and* local prompt is non-empty.
2. Wire into `PipelineBar` when the active tab is Amendment Mask:
   - Render button label unchanged, but on click it needs the mask. The mask must be exported as a **same-resolution PNG** relative to the source image (canvas display size ≠ source pixel size — you need to scale). White = edit region, black = preserve. See doc 03 §8 note and `scripts/sanity-check.ts::buildLeftThirdMaskBase64` for a reference implementation of the polarity.
   - Call `runRender({ mode: "photoreal", amendment: { maskDataUrl, localPrompt } })`.
   - After a successful render, clear the mask canvas (but doc 01 §9 — the mask *is* stored on the resulting `Render` record via `RenderInputsSnapshot.amendment`; the context already puts it there).
3. Doc 04 §5 constraint: `amendment` is only valid in source mode. The schema will reject an amendment in empty mode with a clean error — surface that as a toast if it happens.
4. Doc 01 §9 lock: **one mask per render.** Do not build multi-region masks.

**Acceptance:** draw a shape on the mask, type a local prompt, render — only the masked region changes. The resulting `Render` in Dexie has the `amendment` field populated.

### Milestone 7 — Crop Image

**Entry:** M0 done.

Do:

1. Build `components/output/CropTool.tsx`:
   - Show the active output with a draggable rectangular crop frame overlay.
   - Handles at four corners + edges. Aspect ratio free; snap to pixels.
   - Persist the crop rect as transient state (component / a small store — do NOT put it in Dexie; per doc 01 §9, crop is export-only).
2. When Save Render / Save Sketch is clicked and a crop is active, crop the output blob to that region client-side before calling `downloadBlob`. Use a `<canvas>` — pipe `outputBlob` → `Image` → `drawImage(sx, sy, sw, sh, 0, 0, sw, sh)` → `canvas.toBlob('image/png')`.
3. **Do not mutate the stored `outputBlob`.** Only the exported file is cropped.

**Acceptance:** draw a crop, hit Save — the downloaded PNG is exactly the cropped region; the stored render is untouched (reload → full-size render still there).

### Milestone 8 — Polish (edge / error / loading states)

Doc 06 §6 and §7 enumerate the states. Not all are implemented. Confirmed gaps:

- Loading state currently shows only a single "Rendering…" bar. Doc 06 §7 asks for staged labels ("Thinking… / Rendering… / Finalizing…"). Implement as a `setInterval` in `OutputArea::CanvasArea` while `isRendering`, cycling label every ~4 s.
- Second Render click while one is in flight — already a no-op (`if (isRendering) return` in `runRender`), but the button also disables. Confirm both hold.
- Browser storage full — Dexie throws a `QuotaExceededError` on `.put`. Wrap `saveProject` / `appendRender` calls in a try/catch and toast the user with an "export outputs and clear old renders" suggestion. Right now these throw silently to the console.
- Ref-thumbnail preview on hover / long-press — not implemented (doc 01 §3.3). A tooltip / lightbox on click of the thumbnail *magnifier* icon (not the tile — that inserts the token) would satisfy this. Keep small.
- HEIC decode failure on browsers without support — already surfaced as a toast (`describeUploadError`), verify the messaging.
- Network offline — the fetch will throw with a network error; the render's catch surfaces it. Improve: check `navigator.onLine` up front in `runRender` and short-circuit with the doc 06 §6 "You're offline" copy.
- Model returns no image (safety filter) — the API route returns 502 with a `blockReason` detail; the client already surfaces it. Manually test by prompting for something the safety filter blocks.

### Milestone 9 — Prompt tuning

Depends on M0 outputs and the M6 mask flow. Doc 05 §9 has the checklist:

1. Does the preserve-everything-else rule hold across a variety of interiors? If not, prepend `"CRITICAL: "` to rule 1 or attach the source a second time labeled `[reference for unchanged areas]`.
2. Do the four sketch mediums look different from each other and from photoreal?
3. Does `corner-view` / `eye-level` actually move the camera in edit mode when the camera lock is released?
4. Does the mask boundary blend cleanly? Adjust the amendment block wording, brush edge softness, or both.
5. Golden-hour / night lighting realism.

Keep the tuned strings in `lib/gemini/prompt-template.ts` and update the copies in doc 05 to match — the doc is the spec.

---

## 4. Invariants to preserve (read before editing)

1. **Faithful modification** is the product's soul. The system prompt (`EDIT_SYSTEM` in `lib/gemini/prompt-template.ts`) and doc 05 §2.1 are the current implementation. Do not weaken them. If Milestone 0 tests show drift, strengthen — don't loosen.
2. **The API route is stateless.** All prompt-layer history and image bytes for a call are in the request body. Do not add server-side session state, chat objects, or caches keyed by user. If you find yourself wanting a session, revisit doc 02 §5.
3. **All persistence is IndexedDB via Dexie.** No server DB, no cloud, no auth. If you want to add a table, bump the Dexie version in `lib/db/schema.ts` and add a migration; do not silently mutate v1.
4. **Blobs are stored as Blob**, not base64, everywhere except the `/api/render` wire contract. Do not base64-encode into IndexedDB.
5. **Downsample-before-transit is the only defense against Vercel's 4.5 MB request cap.** If you're tempted to skip it for a "small" image, don't — a PNG in the pixel budget can still be 15 MB.
6. **`[REF NN]` is Audrey's invention; the model does not know it.** Do not send raw tokens to Gemini. `resolveTokens` in the prompt template handles this; keep that call.
7. **Only reference images actually named in the current prompt layers are sent.** Doc 03 §6.2. `resolveAndConcat` records the used indices; the assembly loop filters on them.
8. **Single project, single gallery.** No project switcher UI, no gallery picker. The data model supports many; the UI does not.
9. **Renders are append-only.** Reverting to an older render changes the *starting context* for the next render, not the history (doc 04 §4.9). Do not truncate.
10. **`projectRef` is authoritative inside async callbacks.** Do not close over `project` in setTimeout / fetch continuations. Read from the ref.

---

## 5. Landmines and known sharp edges

- **Node engine.** `package.json` requires Node ≥ 20; the machine you inherit may be on 18 (last known: `next lint` fails with a Node-version error). If your commands fail out of the box, `nvm use 20` (or 22) first.
- **`heic2any` is dynamic-imported** to avoid pulling it into the server bundle. Keep it that way.
- **Dexie touches `indexedDB` at construction.** `getDb()` in `lib/db/schema.ts` throws if called on the server. Do not import `db` at module scope from a server component.
- **Mask polarity.** White = edit, black = preserve. Codified in `AMENDMENT_BLOCK` in the prompt template *and* in the sanity check script — keep them in sync.
- **Reference re-numbering happens on every remove.** Prior render snapshots hold their own copy of the `references` array at render time, so they still know what `[REF 03]` meant *then*. Do not "helpfully" re-index snapshots.
- **The `x-audrey-missing-refs` response header** is how the route tells the client which tokens were dropped for being unavailable. The client (`ProjectContext::runRender`) reads it and toasts. Do not remove the header — the missing-ref path is otherwise invisible.
- **`content-type: application/json` on the render POST.** The zod schema fails on strings; the client must stringify. Trivial but easy to break when refactoring.
- **The prompt template's `[REF NN]` regex tolerates `[ref-1]`, `[REF01]`, `[Ref 1]`.** Test any changes with those variants.
- **`ConfirmModal` binds Esc/Enter to `window`.** If you nest one inside another, both will fire. There is only one modal path today (SourceEmpty → Reset / Empty confirm); if you add more, hoist to a stack.
- **`insertRefTokenAtCursor` in `MasterPrompt.tsx`** reaches into the DOM via `getElementById('audrey-master-prompt')` and drives the native input event so React state updates. If you replace the textarea's id or switch to a controlled setter API, update this helper.
- **Vercel `maxDuration = 60`.** Nano Banana Pro complex renders can approach this. If you see 504s in prod, check Vercel logs first — the failure is on their side, not ours.

---

## 6. How to run and check

```bash
nvm use 20             # if you're on an older Node
npm install
cp .env.example .env.local
# Fill in GEMINI_API_KEY (aistudio.google.com/apikey) and optionally NEXT_PUBLIC_FEEDBACK_RECIPIENT_EMAIL

npm run dev            # http://localhost:3000
npm run typecheck      # must be clean before opening a PR
npm run lint           # must be clean before opening a PR (needs Node ≥ 18.18)
npm run sanity-check   # once per M0, then re-run if you tune the prompt (M9)
```

There is no test suite yet. Milestone 8+ is a good time to add Vitest coverage for `lib/gemini/prompt-template.ts` (pure function, easy) and `lib/images/downsample.ts` (needs a canvas polyfill or a jsdom shim). Do not build a full UI test rig for v1 unless Reza asks.

---

## 7. When you finish a milestone

1. Update **§2 (Ground truth)** and **§3 (What to build next)** in this file — move the milestone into "built and working," strike its "stubbed" row.
2. Update the **Implementation status** section of `00-README.md` if the summary changed.
3. Open a PR against `main` with a title like `feat(m5): sketch sub-mode`. Include a short test-plan checklist Reza can walk through in the app.
4. Do **not** amend across milestones. Each milestone is its own PR.

---

## Changelog

- **2026-07-14** — Initial handoff after PR1 (scaffold + review pass). Milestones 1–4 code-complete; M0 (sanity + smoke), M5–M9 pending.
- **2026-07-14** — M5 (Sketch sub-mode) landed on `feat/m5-sketch-submode`. UI-only change to `components/output/PipelineBar.tsx`; prompt template already handled `mode: "sketch"` via `SKETCH_STYLES`. M0 still pending.
