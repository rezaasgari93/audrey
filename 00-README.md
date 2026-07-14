# Audrey — Build Brief

> **Read this first.** This folder is the complete specification for a single-user web app called **Audrey**. It uses Google's **Nano Banana Pro** (`gemini-3-pro-image-preview`) to edit and generate architectural images. This README is the entry point and reading order for implementation.

---

## What we're building (in three sentences)

Audrey is a single-user web app for iterating on architectural images with AI. The user either **uploads a photo and edits it** with layered natural-language prompts (changing only what they ask, preserving the rest), or **describes a scene from scratch** and the model generates it. Outputs come as photorealistic renders or artistic sketches, with reference images, structured scene controls (camera/lighting/people), region-masked amendments, comparison, cropping, and high-resolution save.

A working prototype already exists ("Project Aether" is an example project shown in its UI); these specs are derived from it plus the product owner's written requirements.

---

## Reading order

| # | File | What it covers | Status |
|---|------|----------------|--------|
| 0 | `00-README.md` | This file — overview, reading order, v1 scope, build order. | — |
| 1 | [`01-core-features.md`](01-core-features.md) | Every input, output, and interaction surface. The product spec. | v0.3, handoff-ready |
| 2 | [`02-tech-stack-brainstorm.md`](02-tech-stack-brainstorm.md) | The locked stack decision, packages, project structure, env vars, deploy. *(Filename says "brainstorm" but content is the final decision — sandbox couldn't rename.)* | v1.0, locked |
| 3 | [`03-nano-banana-pro-api.md`](03-nano-banana-pro-api.md) | What the model can do, mapped to features. Cost, limits, gotchas. | v0.1 |
| 4 | [`04-data-model.md`](04-data-model.md) | Entities, TypeScript types, IndexedDB (Dexie) schema, lifecycle ops. | v1.0 |
| 5 | [`05-prompt-template.md`](05-prompt-template.md) | How UI inputs become the actual prompt + image parts sent to Gemini. | v1.0 |
| 6 | [`06-user-flow.md`](06-user-flow.md) | Happy paths + error/edge states + loading states. | v1.0 |
| 7 | [`07-engineer-handoff.md`](07-engineer-handoff.md) | **Start here after reading 01–06.** Current implementation status, what to build next, invariants to preserve, landmines. | Live — updated each handoff |

---

## The stack (summary — full detail in doc 2)

- **Next.js (App Router) + TypeScript + Tailwind**, deployed on **Vercel**.
- **`@google/genai`** SDK, called from a single stateless server route `/api/render` (keeps the API key off the browser).
- **IndexedDB via Dexie** for all client persistence — no server database, no auth (single user).
- Plain `<canvas>` for the amendment mask; a hand-rolled drag-handle slider for comparison.

---

## v1 scope — what to build

**In:**
- Source (edit) and Empty (generate) input modes.
- Master Prompt with `[REF NN]` syntax + layered prompt history.
- Reference Gallery (up to 14 images, warn past 5).
- Scene controls: Source Mode (Interior/Isometric), Camera Angle (5 options), Light Mode (3), People (4).
- Render (Photoreal) + Sketch sub-mode (4 mediums).
- Comparison (slider), Amendment Mask (stylus, one region per render), Crop Image (client-side).
- Render history strip with revert.
- Save/download as 4K PNG.
- Learning & Improvement feedback (`mailto:`).
- Single project + single gallery (data model ready for more).

**Out (deferred, non-breaking to add later):**
- **Map** input button — purpose undefined; hidden behind a feature flag.
- **Life Engine** tab — purpose undefined; hidden behind a feature flag.
- Multi-project/gallery UI, comparison vs. prior renders, branching history, accounts, cloud sync, mobile-phone layout.

---

## The two things still genuinely unknown

Both are hidden in v1 and reserved in the data model, so they can be added later without rework. They need the product owner (Reza) to define them:

1. **Map button** — best guess is "upload a floorplan as an extra input image," but unconfirmed.
2. **Life Engine** — purpose unknown. If it turns out to mean animation/video, that's a different model (Veo), not Nano Banana Pro.

A handful of smaller decisions were made as **locked defaults** to keep momentum — they're listed in [`01-core-features.md`](01-core-features.md) §9, each with a one-line rationale, and any can be overridden.

---

## Suggested build order

1. **Scaffold** — Next.js + TS + Tailwind project per doc 2's structure. Set up `.env.example`, Dexie schema (doc 4), shared types.
2. **Render route** — `/api/render` calling `@google/genai`, with the prompt-template module (doc 5). Test against AI Studio expectations first; confirm the mask format and "preserve everything" behavior empirically (doc 3 §8).
3. **Input panel** — Source/Empty buttons, upload + validation + HEIC conversion + downsampling, Master Prompt, Reference Gallery, Scene panel.
4. **Output area, basic** — canvas, Comparison tab (slider), Render (Photoreal) button wired to the route, loading/error states, history strip + persistence.
5. **Sketch sub-mode** — medium buttons, sub-mode toggle, Save Sketch.
6. **Amendment Mask** — canvas drawing, mask export, local prompt, masked render.
7. **Crop Image** — client-side crop affecting export only.
8. **Polish** — Learning & Improvement feedback, Reset All, prompt history revert, edge-case handling from doc 6 §6.
9. **Tune prompts** — iterate on doc 5's strings against real outputs.

Milestone 4 is the first end-to-end usable cut (upload → prompt → photoreal render → compare → save).

---

## Implementation status (as of the last handoff)

Milestones 1–4 are **code-complete but not yet validated end-to-end**:

- Scaffold, Dexie schema, `/api/render`, prompt-template module — done.
- Input Panel (Source/Empty/Reset, Master Prompt + history, Reference Gallery, Scene) — done.
- Output Area with Comparison slider, history strip, PipelineBar (Render Photoreal + Save), Toaster, ConfirmModal — done.
- Amendment Mask, Crop Image, Sketch sub-mode — **stubbed** (placeholder text in tabs / pipeline).
- Sanity check script (`npm run sanity-check`) exists but **has not been run** against a real fixture; the two "does the model behave" questions from the kickoff are open.

The full status matrix, next actions, invariants, and landmines live in **[`07-engineer-handoff.md`](07-engineer-handoff.md)** — read that before you write code.

---

## Key constraints to honor throughout

(From [`01-core-features.md`](01-core-features.md) §7 — these are the soul of the product.)

1. **Faithful modification** — change only what's asked; preserve everything else.
2. **Camera angle lock** — unless the user explicitly changes it.
3. **Reference grounding** — `[REF NN]` images are authoritative for what they depict.
4. **Layered, non-destructive iteration** — prompts stack; the model sees cumulative intent.
5. **Explicit disabled states** — never silently broken.
6. **Mode-aware** — preservation constraints apply in edit mode, not generate mode.

---

## A note on the API key & cost

- Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Set it as `GEMINI_API_KEY` (server-side only).
- Free tier: ~500 image generations/day. Paid: ~$0.13 (2K) / ~$0.24 (4K) per image. Single-user cost is effectively zero.
