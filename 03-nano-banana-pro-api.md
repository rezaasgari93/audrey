# Audrey — Nano Banana Pro API Investigation

> **Status:** Draft v0.1 — based on Google's published documentation as of May 2026.
> **Purpose:** Confirm what Nano Banana Pro can actually do, and map its capabilities to Audrey's feature spec ([01-core-features.md](01-core-features.md)) so we know what's natively supported, what needs workarounds, and what's blocked.
> **Headline:** Every feature Audrey needs is natively supported. Cost for single-user dev is effectively zero.

---

## 1. Model identity

| Property             | Value                                                              |
| -------------------- | ------------------------------------------------------------------ |
| Marketing name       | **Nano Banana Pro**                                                |
| Model ID             | `gemini-3-pro-image-preview`                                       |
| Foundation           | Gemini 3 Pro (reasoning-driven, "Thinking" mode supported)         |
| Status               | Preview                                                            |
| Last updated         | November 2025                                                      |
| Knowledge cutoff     | January 2025                                                       |
| Input token limit    | 65,536                                                             |
| Output token limit   | 32,768                                                             |
| Inputs               | Text + Image                                                       |
| Outputs              | Image + Text                                                       |

Where "Nano Banana" (no Pro) appears in older docs, it refers to `gemini-2.5-flash-image` — a smaller, cheaper, less capable sibling. **Audrey targets the Pro model.**

---

## 2. Capability check against Audrey's feature spec

The summary table — does Nano Banana Pro natively support what the spec needs?

| Audrey feature                                  | Supported?     | Notes                                                                                              |
| ----------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| Modify a source image faithfully (preserve geometry, scene) | ✅ Yes  | Core capability. Achieved via prompt + source image input.                                          |
| Multiple reference images (Reference Gallery)   | ✅ Yes         | Up to **14 input images** per call. High fidelity at **5 or fewer**; can drop above that. Up to 5 people kept consistent. |
| Region-specific edits (Amendment Mask)          | ✅ Yes — native | Both auto-detected masks (described in prompt) and **user-supplied binary mask images** are supported. Used for inpainting (add) and outpainting (remove). |
| Layered / iterative prompts                     | ✅ Yes         | Multi-turn chat is native. Use a chat session per project; each render is a `chat.send_message()`. Matches Reza's "layer on top, don't replace" requirement directly. |
| Photoreal output (Render mode)                  | ✅ Yes         | Style is controlled by prompt. No different model needed.                                          |
| Artistic sketch output (Sketch mode)            | ✅ Yes         | Same model, controlled by prompt phrasing (e.g., "watercolour painting, loose washes, pencil lines"). |
| High-resolution output (Save/download)          | ✅ Yes         | Up to **4096 × 4096** (true 4K) native. No external upscaler needed.                              |
| Empty mode (no source, prompt-only)             | ✅ Yes         | Text-to-image is supported. Empty mode is just generation with no input image.                    |
| Map mode (upload floorplan + use as input)      | ✅ Yes *(if defined this way)* | Floorplan can be one of the up-to-14 input images; the model can reason about it. Still need product-level definition. |
| Text rendering in image (signage, labels)       | ✅ Yes         | Dramatically improved vs. prior models — relevant if outputs need readable text on storefronts etc. |
| Camera angle override (Wide / Corner / Eye / Detail) | ✅ Yes — via prompt | The model supports "localized control with region- and object-targeted changes" plus camera/style direction. Realistically implemented as prompt instructions. |
| Lighting condition change (Day / Night / Golden hour) | ✅ Yes — via prompt | Same — explicit prompt instruction. The model identifies natural and artificial light sources. |
| People density control                          | ✅ Yes — via prompt | Same.                                                                                              |
| Cropping (Crop Image tab)                       | ✅ Yes *(client-side)* | Almost certainly best implemented client-side (canvas crop on the returned image). Calling the model for cropping would be wasteful. |
| Life Engine *(undefined)*                       | ❓ Depends      | Until we know what this feature is, can't say. If it's animation/video, that's **Veo** (a different model), not Nano Banana Pro. |

**Bottom line:** every spec'd feature except "Life Engine" is natively achievable with Nano Banana Pro.

---

## 3. Mapping Audrey's inputs to API calls

### 3.1 Reference Gallery → input images

References are passed alongside the source image as additional `inline_data` blobs (base64) or via the Files API for larger files. The model receives them in order; the prompt refers to them by description or position.

**Implication for Audrey's `[REF 01]` syntax:** the model doesn't natively recognize the `[REF NN]` token. We need to translate it at the proxy layer. For example, the user writes:

> "Change the floor to [REF 01]."

…and the server sends to the model:

> "Change the floor to the material/texture shown in the first reference image."

Plus the actual image as input #2 (after the source). This is a small but important prompt-template responsibility — covered in the planned data-model / prompt-template doc.

### 3.2 Amendment Mask → mask image input

The native pattern: send the source image plus a black-and-white mask image (white = region to edit, black = preserve). The user's freehand stylus drawing on the canvas becomes the mask layer. Pipe both to the model with a localized prompt.

This avoids a fragile workaround (e.g., drawing a red overlay on the source and hoping the model understands). The clean native flow is the right one.

### 3.3 Source / Map / Empty → number of input images

| Mode      | Input images                                                            |
| --------- | ----------------------------------------------------------------------- |
| **Source**| Source image + reference gallery (1 + N).                               |
| **Map**   | Source image + map/floorplan + reference gallery (2 + N) — assuming Map adds a floorplan alongside the source. |
| **Empty** | No source. Reference gallery only (0 + N). Or zero images for pure text-to-image. |

All three fit within the 14-image native limit comfortably for single-user use.

### 3.4 Layered prompts → multi-turn chat

Use the SDK's chat object:

```python
chat = client.chats.create(model="gemini-3-pro-image-preview")
response_1 = chat.send_message(["initial render prompt", source_image, ref_1, ref_2])
# … user reviews, adds to the master prompt
response_2 = chat.send_message(["additional instructions", new_ref])
```

The chat keeps prior context. Each render in Audrey is one `send_message`. Mirrors the spec's "iteration is layered, not destructive" constraint exactly.

---

## 4. What this resolves in the spec

Going back to `01-core-features.md` §7 open questions, this investigation answers or de-risks several:

| Open question                                                                 | Status                                                                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Q11 — Accepted formats / max file size                                        | API accepts PNG/JPEG/WebP via `inline_data`. For large files use Files API. Single user is unconstrained. |
| Q22 — Default download resolution                                             | **4K (4096 × 4096) is the model max**; saving the raw output at 4K is the right default. PNG for fidelity. |
| Q20–Q21 — Amendment Mask: multiple masks per pass, persistence                | Single mask per call is the native pattern. Multi-region edits = multiple sequential calls, or a single mask with multiple white regions. Persistence as overlay is a UI choice, not an API constraint. |
| "Does the API support multiple references in one call?" *(implicit blocker)*  | Yes, up to 14. Reference Gallery as designed is fully feasible.                                          |
| "Does the API support region masks?" *(implicit blocker)*                     | Yes, natively. Amendment Mask as designed is fully feasible.                                             |
| "Do we need an external upscaler for high-res save?"                          | No. 4K native.                                                                                           |
| "Does the multi-turn / layered-prompt pattern work?"                          | Yes, via the chat object.                                                                                |

---

## 5. Cost & quota picture for single-user

- **Free tier**: 500 image generations per day via Google AI Studio — covers all dev and personal use.
- **Paid (if you exceed the free tier):**
  - 2K image: $0.134
  - 4K image: $0.24
- **Implication for Audrey:** at single-user scale, cost is essentially zero. A back-of-envelope: 100 4K renders/day = $24/day max if you blow past the free tier, which you're unlikely to do.

No rate-limit infrastructure needed in v1. The model API's own quotas suffice.

---

## 6. Implementation gotchas to flag for Claude Code

1. **"Thinking" mode is supported but slower and more expensive.** Off by default in most SDK examples; turning it on improves complex compositions. Consider exposing as an advanced toggle, or enable for renders that involve many references / complex masks.
2. **Input tokens include image tokens.** With a 65K input limit and the chance of many 4K reference images, large reference galleries could push limits. Recommend lazily loading only the references named in the current prompt rather than sending all of them every turn.
3. **Mask image format isn't fully documented in the search results.** Almost certainly a same-size PNG with white = edit, black = preserve. **Worth a 10-minute hands-on test** before locking the implementation.
4. **The model is in Preview.** No SLA, may change. Acceptable for v1; flag in any user-facing reliability messaging.
5. **The model is OpenAI-API-compatible.** This means if Audrey is ever ported off Gemini, the surface area is minimal. Nice insurance.
6. **Files API vs inline data.** For the typical Audrey session (one source, handful of refs), inline base64 is simplest. For very large/4K reference images, the Files API uploads once and is then referenced by handle — better for repeated calls.
7. **Prompt translation layer.** The `[REF NN]` syntax is Audrey's invention; the model doesn't know it. The server-side proxy must translate `[REF 01]` → "the material/texture in the first reference image" (or similar) before calling the API. Belongs in the prompt-template doc.

---

## 7. Recommended SDK / starting point

- **Python:** `pip install -U "google-genai>=1.52.0"` — the official SDK.
- **Node/TypeScript:** `@google/genai` (same vendor, equivalent API). Better fit for the Next.js stack proposed in `02-tech-stack-brainstorm.md`.
- **API keys:** free from [Google AI Studio](https://aistudio.google.com/apikey).
- **Try it now:** https://aistudio.google.com/?model=gemini-3-pro-image-preview — the Studio UI lets you experiment with the model interactively before writing any code.

---

## 8. Remaining unknowns to verify hands-on

The investigation above is based on documentation. A short hands-on session in AI Studio (no coding required) would resolve the few remaining specifics:

1. **Exact mask image format** (color depth, polarity, anti-aliasing tolerance).
2. **Behavior when a reference image is sent but never referenced in the prompt** — is it ignored, or does it influence the output anyway?
3. **How well the model honors "preserve everything except X" instructions** in practice — this is the central Audrey UX claim, worth empirical confirmation with a real interior photo before locking the prompt-template design.
4. **Whether multi-turn chat correctly preserves the source image across turns** without re-sending it — the SDK docs imply yes; worth confirming.

These are all 10–20 minute experiments in AI Studio. None are blockers; they refine implementation details.

---

## 9. Things this investigation does *not* cover

- Imagen models (separate model family, used for some specialised editing flows in Vertex AI). Nano Banana Pro is sufficient for Audrey; Imagen is not needed.
- Veo (video generation). Mentioned only because if "Life Engine" turns out to mean animation, a different model is involved.
- Vertex AI vs. AI Studio account/billing setup specifics — not blocking, easy to figure out at implementation time.
