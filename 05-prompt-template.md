# Audrey — Prompt Template

> **Status:** Draft v1.0 — handoff-ready. The actual prompt strings below are starting points; expect to tune them against real outputs (see [03-nano-banana-pro-api.md](03-nano-banana-pro-api.md) §8).
> **Purpose:** Define exactly how Audrey's UI inputs are assembled into the prompt and image parts sent to Nano Banana Pro. This is the single most important file for output quality — it encodes the "change only what's asked, preserve everything else" promise.
> **Lives in:** `lib/gemini/prompt-template.ts`.

---

## 1. Anatomy of a render request

Every model call is built from these pieces, in this order:

1. **System instruction** — the role + the hard constraints (preserve fundamentals, preserve camera). Sent as `systemInstruction`.
2. **Output-style block** — photoreal vs. the chosen sketch medium.
3. **Scene-context block** — source mode, camera angle, lighting, people, translated from the controls.
4. **User instruction block** — the concatenated master-prompt layers, with `[REF NN]` resolved.
5. **Amendment block** — present only for masked edits.
6. **Image parts** — the source image (if any), the mask (if any), then the referenced images, in order.

The function signature:

```ts
function buildPrompt(input: RenderRequest): {
  systemPrompt: string;
  userParts: Part[]; // text + inlineData image parts
};
```

---

## 2. System instruction

### 2.1 Edit mode (Source — there is a source image)

```
You are a precise architectural visualization engine. You modify an existing
image of a real space according to the user's instructions.

HARD RULES — these override anything in the user instructions:
1. Change ONLY what the instructions explicitly request. Everything else in the
   source image must be preserved exactly: room geometry, layout, proportions,
   structural elements, window and door positions, and any materials, fixtures,
   furniture, or details the instructions do not mention.
2. Preserve the camera angle, framing, focal length, perspective, and viewpoint
   of the source image. (This rule is lifted ONLY when the scene context below
   specifies a camera angle other than "original".)
3. Do not add, remove, or restyle anything that was not asked for.
4. Maintain photographic/architectural plausibility: correct scale, consistent
   lighting direction, accurate shadows and reflections.

If an instruction is ambiguous, make the smallest change that satisfies it.
```

### 2.2 Generate mode (Empty — no source image)

```
You are a precise architectural visualization engine. You generate a new image
of a space from the user's description.

RULES:
1. Realize the user's description faithfully, honoring the scene context below
   (perspective, camera framing, lighting, occupancy).
2. Maintain architectural plausibility: correct scale, consistent lighting,
   accurate shadows and reflections, coherent spatial geometry.
3. Where reference images are provided, treat them as authoritative for the
   materials, finishes, objects, or styling they depict.
```

---

## 3. Output-style block

Appended to the user instruction. One of the following based on `mode` / `sketchMedium`.

### 3.1 Photoreal

```
OUTPUT STYLE: Photorealistic, magazine-quality architectural photography.
Lifelike materials and textures, physically accurate lighting, sharp focus,
professional composition, true-to-life color. No illustration or painterly
effects.
```

### 3.2 Sketch mediums

| Medium                  | Style block                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pencil**              | `OUTPUT STYLE: Hand-drawn graphite pencil sketch. Visible pencil strokes, soft shading and hatching, paper texture, monochrome. An architect's freehand study — not photorealistic.` |
| **Fine-line fountain pen** | `OUTPUT STYLE: Fine-line fountain-pen ink drawing. Crisp confident black line work, light cross-hatching for shadow, white background, architectural illustration style. No color washes, no photorealism.` |
| **Watercolour**         | `OUTPUT STYLE: Architectural watercolour rendering. Loose translucent colour washes over light ink/pencil line work, soft bleeding edges, visible brushwork, white paper showing through. A hand-painted impression — not photorealistic.` |
| **Magic marker**        | `OUTPUT STYLE: Marker-rendered architectural sketch. Bold confident marker strokes, flat saturated color blocks, visible streaks, designer presentation-marker style over line work. Not photorealistic.` |

All sketch blocks end with: `Preserve the architectural accuracy and composition of the scene beneath the artistic medium.`

---

## 4. Scene-context block

Built from `SceneSettings`. Only include lines relevant to the mode.

```
SCENE CONTEXT:
- Perspective: {sourceMode}
- Camera: {cameraAngle}
- Lighting: {lightMode}
- Occupancy: {people}
```

Translation tables:

### 4.1 Source mode → Perspective

| Value       | Text                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `interior`  | `first-person interior view, as if standing inside the space`                                     |
| `isometric` | `isometric projection — bird's-eye view with all horizontal planes drawn at 30° from the baseline, no perspective convergence` |

### 4.2 Camera angle → Camera

| Value         | Text (edit mode)                                                                 | Text (generate mode)                                        |
| ------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `original`    | `keep the exact camera position, framing, and lens of the source image`          | `a natural, well-composed framing of the space`             |
| `wide-angle`  | `re-frame with a wider field of view from a similar position, capturing more of the room` | `wide-angle framing capturing most of the room`     |
| `corner-view` | `position the camera in a corner of the room, looking diagonally across the space` | `corner vantage point looking diagonally across the space` |
| `eye-level`   | `position the camera at standing eye level (~1.6 m) with a natural horizontal framing` | `eye-level framing at standing height`                  |
| `detail-shot` | `tight close-up framing on the focal subject of the instructions{maskSubject}`   | `tight close-up on the described focal subject`             |

`{maskSubject}` resolves to ` (the region indicated by the amendment mask)` when a mask is active, otherwise empty.

> When `cameraAngle !== 'original'` in edit mode, the system instruction's camera-lock rule is explicitly released; the prompt template adds: `NOTE: The user has requested a camera change; you MAY re-frame as specified above while still preserving the identity of the space and its contents.`

### 4.3 Light mode → Lighting

| Value         | Text                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `daylight`    | `bright natural midday daylight; identify windows and openings and light the space realistically from them` |
| `night`       | `nighttime; dark exterior, with the space lit by its artificial light sources (lamps, fixtures); identify and switch on plausible interior lighting` |
| `golden-hour` | `golden-hour light; warm, low-angle sun creating long soft shadows and warm tones`                          |

### 4.4 People → Occupancy

| Value    | Text                                                            |
| -------- | --------------------------------------------------------------- |
| `none`   | `no people; an empty space`                                     |
| `subtle` | `one or two people, unobtrusive and naturally placed`           |
| `minor`  | `a modest number of people, naturally populating the space`     |
| `heavy`  | `a busy, densely populated scene with many people`              |

If the user has described a *type* of person in the master prompt (e.g., "school children"), that text carries through naturally in the user-instruction block; the occupancy line sets the density.

---

## 5. User-instruction block + `[REF NN]` resolution

### 5.1 Layer concatenation

The master-prompt layers are concatenated newest-last, framed so the model treats them as a cumulative brief:

```
USER INSTRUCTIONS (apply all, in order; later instructions refine earlier ones):
1. {layer 1 text}
2. {layer 2 text}
...
N. {layer N text}
```

For a first render there is one layer. For iterative renders, all prior layers are included so a stateless API call still has full context (the route is stateless by design — see [02-tech-stack.md](02-tech-stack-brainstorm.md) §5).

### 5.2 `[REF NN]` substitution

The model does not understand the `[REF NN]` token. Before sending, replace each token with a natural-language pointer, and attach the corresponding image part.

- Detect tokens case-insensitively, tolerating spacing/zero-padding: `[REF 01]`, `[ref1]`, `[REF-1]` all match index 1.
- Replace `[REF 01]` with: `the content shown in reference image 1` (and so on).
- Collect the set of referenced indices; attach those image parts (see §7). If a referenced index doesn't exist (e.g., it was removed), drop the token and append a note: `(reference 1 is unavailable)` — do not fail the render.

Example:

> User writes: `Change the floor to [REF 01] and the sofa fabric to [REF 02].`
> Sent to model: `Change the floor to the content shown in reference image 1 and the sofa fabric to the content shown in reference image 2.`
> Image parts attached: source, ref-1, ref-2.

---

## 6. Amendment block (masked edits only)

When `input.amendment` is present, append:

```
AMENDMENT TARGET: A mask image is included with the inputs. Modify ONLY the
region marked WHITE in the mask. Leave everything in the BLACK region exactly
as it appears in the source image, with seamless blending at the mask boundary.

LOCALIZED INSTRUCTION: {amendment.localPrompt}
```

The mask is attached as an image part immediately after the source (see §7). The `localPrompt` may itself contain `[REF NN]` tokens — resolve them the same way as §5.2.

---

## 7. Image-part ordering

Order matters for the model's interpretation. Assemble `userParts` as:

1. All text blocks, concatenated in the order: output-style → scene-context → user-instructions → amendment (text portions).
2. **Source image** (`inlineData`) — omitted in Empty mode.
3. **Mask image** (`inlineData`) — only if an amendment is active.
4. **Reference images** (`inlineData`), in ascending index order, but only those actually referenced by the current prompt layers (lazy attach — saves input tokens, per [03-nano-banana-pro-api.md](03-nano-banana-pro-api.md) §6.2).

A short label precedes each image part so the model can distinguish them, e.g. a text part `"[source image]"`, `"[edit mask]"`, `"[reference image 1]"` immediately before each `inlineData`.

---

## 8. Worked example (edit mode, photoreal, with reference + camera change)

**Inputs:** Source mode, camera = `corner-view`, lighting = `golden-hour`, people = `subtle`, master prompt = `Replace the worktop with [REF 01]. Add pendant lights over the island.`

**System instruction:** the §2.1 edit-mode block.

**userParts (text, assembled):**

```
OUTPUT STYLE: Photorealistic, magazine-quality architectural photography. ...

SCENE CONTEXT:
- Perspective: first-person interior view, as if standing inside the space
- Camera: position the camera in a corner of the room, looking diagonally across the space
- Lighting: golden-hour light; warm, low-angle sun creating long soft shadows and warm tones
- Occupancy: one or two people, unobtrusive and naturally placed

NOTE: The user has requested a camera change; you MAY re-frame as specified
above while still preserving the identity of the space and its contents.

USER INSTRUCTIONS (apply all, in order; later instructions refine earlier ones):
1. Replace the worktop with the content shown in reference image 1. Add pendant lights over the island.
```

**userParts (images):** `[source image]` + source blob, `[reference image 1]` + ref-1 blob.

---

## 9. Tuning checklist (post-implementation)

Once a real render path exists, validate against actual interior photos and adjust wording:

1. Does the "preserve everything else" rule hold, or does the model drift on unmentioned elements? If it drifts, strengthen rule 1 and consider sending the source twice (once labeled "reference for unchanged areas").
2. Do sketch mediums look distinct from one another and from photoreal? Adjust style blocks.
3. Does `corner-view` / `eye-level` actually move the camera, or does the model ignore it? May need stronger phrasing or example framing.
4. Does the mask boundary blend cleanly? Tune the amendment block and mask edge softness.
5. Are golden-hour / night lighting changes physically convincing? Adjust lighting phrasing.

Keep the tuned strings in this file as the source of truth; the implementation imports them.
