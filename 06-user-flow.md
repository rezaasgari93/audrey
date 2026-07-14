# Audrey — User Flow

> **Status:** Draft v1.0 — handoff-ready.
> **Purpose:** Walk the typical session end-to-end and enumerate the key error/edge states, so Claude Code builds the right states and transitions rather than just the happy path.

---

## 1. First launch

1. App opens to the workspace. No project data exists yet, so the app silently creates the default project ("Project Aether" / "Primary Gallery") per [04-data-model.md](04-data-model.md) §4.1.
2. Input mode defaults to **Source**. The output canvas shows an empty placeholder ("Choose a source image to begin, or switch to Empty to generate from a description.").
3. The **Render (Photoreal)** button is **disabled** (no source yet). Scene controls show their defaults (Interior / Original / Daylight / None).

---

## 2. Happy path — edit an existing image

1. **Choose source.** User clicks **Source**, picks an interior photo. The app validates format/size, converts HEIC if needed, stores it, and shows it on the canvas in the Comparison tab. Render button **enables**.
2. **Add references (optional).** User clicks **Add Refs**, selects a couple of material/furniture images. They appear in the Reference Gallery as `[REF 01]`, `[REF 02]` with thumbnails.
3. **Set the scene.** User leaves Interior, switches Lighting to **Golden hour**, People to **Subtle**.
4. **Write the master prompt.** User types: *"Replace the floor with [REF 01], warm oak planks."* Clicking the `[REF 01]` thumbnail inserts the token at the cursor.
5. **Render.** User clicks **Render (Photoreal)**. Button shows a spinner; canvas shows a loading state ("Thinking… / Rendering…"). The request goes to `/api/render`.
6. **Review.** Output appears in the canvas. It's added to the history strip with a "Render" badge. The committed prompt layer appears in Prompt History; the textarea clears.
7. **Compare.** User taps **Comparison** and drags the slider to see before/after.
8. **Refine (layer).** User types a follow-up: *"Add a large pendant light over the dining table."* and renders again. The model receives both layers; the new output is appended to history.
9. **Localized fix (Amendment Mask).** User taps **Amendment Mask**, draws a circle around a wall, types *"add a framed artwork here,"* and renders. The mask is sent with the source; only that region changes.
10. **Crop.** User taps **Crop Image**, drags the crop frame to a tighter composition.
11. **Save.** User clicks **Save Render**. A 4K PNG of the cropped output downloads with the `audrey_…` filename.

---

## 3. Happy path — generate from scratch (Empty mode)

1. **Switch to Empty.** User clicks **Empty**. If a source was loaded, a confirm modal warns it'll be cleared. Canvas placeholder updates ("Describe a scene and render to generate it.").
2. **Add references (optional).** Same as edit mode — useful for materials/mood.
3. **Set the scene.** e.g., Isometric / Daylight / None.
4. **Describe.** User types: *"A small Scandinavian café interior, pale wood, large windows, [REF 01] tiles on the counter."*
5. **Render.** The Render button is enabled in Empty mode without a source (there's nothing to require). Output generates and lands in history.
6. From here, refine / sketch / crop / save exactly as in edit mode.

---

## 4. Sketch sub-mode

1. From any state with a renderable input, the user clicks a sketch medium (e.g., **Watercolour**).
2. The pipeline bar enters sketch sub-mode: **Close Sketch Mode** link appears top-right; **Save Render** becomes **Save Sketch**.
3. A watercolour render is triggered immediately using the same inputs.
4. The user can click **Pencil** to re-render the same scene in pencil, etc. Each is appended to history with a "Sketch" badge.
5. **Close Sketch Mode** returns to the photoreal default bar; the latest sketch stays in history.

---

## 5. Reverting & iterating

- The **history strip** under the canvas shows every render as a thumbnail with a mode badge.
- Clicking an older thumbnail makes it the active output and rolls the master-prompt layers and scene settings back to that render's snapshot.
- Rendering again from that point appends a new render (history stays linear/append-only in v1 — see [04-data-model.md](04-data-model.md) §4.9).

---

## 6. Error & edge states

| Situation                                          | Behavior                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Render clicked with no source (Source mode)        | Button is disabled; can't be clicked. Tooltip: "Choose a source image first."                             |
| Amendment Mask active but mask empty or no local prompt | Render disabled; inline hint explains both are required.                                              |
| Upload wrong format                                | Reject with a toast: "Unsupported file type. Use PNG, JPEG, WebP, or HEIC."                                |
| Upload too large (> 25 MB)                         | Reject with a toast naming the limit. Suggest the user downscale.                                          |
| > 5 references added                               | Allow up to 14; show an inline warning past 5 that fidelity may drop. Block (with explanation) past 14.    |
| Referenced `[REF NN]` no longer exists             | Don't fail. Drop the token, render anyway, and toast: "Reference N was removed; it was skipped."           |
| Model call fails / times out                       | Canvas shows an error card with the message and a **Retry** button. The prompt layer is NOT committed.     |
| Model returns no image (safety filter, etc.)       | Error card explaining no image was produced; suggest rephrasing. Retry available.                          |
| Network offline                                    | Toast: "You're offline — rendering needs a connection." Inputs and history remain (IndexedDB is local).    |
| Render in flight, user clicks Render again         | Second click ignored; button shows in-progress state until the first completes.                            |
| Reset All                                          | Confirmation modal with an "Export outputs first?" nudge. On confirm, clears inputs and (default) renders. |
| Switching Source ↔ Empty with unsaved source       | Confirm modal before clearing the source image.                                                            |
| Browser storage full (IndexedDB quota)             | Toast warning; suggest exporting and deleting old renders. Don't lose the current session silently.        |
| HEIC on a browser that can't decode it             | Convert client-side via `heic2any` before display/storage (see [02-tech-stack.md](02-tech-stack-brainstorm.md) §8.5). |

---

## 7. Loading & feedback states (summary)

- **Render in flight:** primary button spinner + canvas skeleton with staged labels ("Thinking…", "Rendering…", "Finalizing…"). Nano Banana Pro can take several seconds, more with Thinking mode — keep the user informed.
- **Upload processing:** brief thumbnail-generation spinner on new references.
- **Save:** immediate; no spinner needed for a local download.
- **Submit Feedback:** opens the mail client; show a small confirmation toast ("Opening your email app…").

---

## 8. Out-of-scope flows (v1)

- Switching between multiple projects or galleries (single project/gallery in v1).
- Comparing the output against a previous render (only source-vs-output in v1).
- Branching history trees (append-only in v1).
- Map input and Life Engine flows (features hidden in v1).
