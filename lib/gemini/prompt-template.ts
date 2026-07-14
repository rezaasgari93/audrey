// Doc 05 — the source of truth for what we send to the model.
// Expect to tune the strings in §EDIT_SYSTEM, §STYLE, etc. against real outputs.
// The structure (block order, [REF NN] resolution) should not change without
// re-reading doc 05.

import type {
  CameraAngle,
  LightMode,
  OutputMode,
  PeopleDensity,
  RenderRequest,
  SceneSettings,
  SketchMedium,
  SourceMode,
} from "@/lib/types";

// ---------- Public API ----------

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface BuiltPrompt {
  systemPrompt: string;
  userParts: GeminiPart[];
  // For logging / debugging:
  resolvedReferenceIndices: number[];
  missingReferenceIndices: number[];
}

export function buildPrompt(input: RenderRequest): BuiltPrompt {
  const isEdit = input.inputMode === "source";
  const systemPrompt = isEdit ? EDIT_SYSTEM : GENERATE_SYSTEM;

  // 1. Output style.
  const styleText = stylePart(input.mode, input.sketchMedium);

  // 2. Scene context.
  const sceneText = sceneContextPart(input.scene, isEdit, !!input.amendment);

  // 3. User instructions — concatenated layers, with [REF NN] resolved.
  const availableIndices = new Set(input.references.map((r) => r.index));
  const { text: instructionsText, used, missing } = resolveAndConcat(
    input.promptLayers,
    availableIndices,
  );

  // 4. Amendment block (text).
  let amendmentText = "";
  if (input.amendment) {
    const { text: localText, used: usedInMask, missing: missingInMask } =
      resolveTokens(input.amendment.localPrompt, availableIndices);
    usedInMask.forEach((i) => used.add(i));
    missingInMask.forEach((i) => missing.add(i));
    amendmentText = AMENDMENT_BLOCK.replace("{localInstruction}", localText);
  }

  // Assemble the text portion in the order specified in doc 05 §7.
  const textBlocks = [styleText, sceneText, instructionsText];
  if (amendmentText) textBlocks.push(amendmentText);

  const userParts: GeminiPart[] = [{ text: textBlocks.join("\n\n") }];

  // 5. Image parts — source, mask, then referenced images in ascending index.
  if (isEdit && input.sourceImageBase64 && input.sourceMimeType) {
    userParts.push({ text: "[source image]" });
    userParts.push({
      inlineData: {
        mimeType: input.sourceMimeType,
        data: input.sourceImageBase64,
      },
    });
  }

  if (input.amendment && isEdit) {
    userParts.push({ text: "[edit mask — white = edit, black = preserve]" });
    userParts.push({
      inlineData: {
        mimeType: "image/png",
        data: input.amendment.maskBase64,
      },
    });
  }

  // Lazy-attach: only refs actually named by tokens in the prompt.
  const refsToAttach = input.references
    .filter((r) => used.has(r.index))
    .sort((a, b) => a.index - b.index);
  for (const ref of refsToAttach) {
    userParts.push({ text: `[reference image ${ref.index}]` });
    userParts.push({
      inlineData: { mimeType: ref.mimeType, data: ref.base64 },
    });
  }

  return {
    systemPrompt,
    userParts,
    resolvedReferenceIndices: [...used].sort((a, b) => a - b),
    missingReferenceIndices: [...missing].sort((a, b) => a - b),
  };
}

// ---------- System instructions (doc 05 §2) ----------

const EDIT_SYSTEM = `You are a precise architectural visualization engine. You modify an existing image of a real space according to the user's instructions.

HARD RULES — these override anything in the user instructions:
1. Change ONLY what the instructions explicitly request. Everything else in the source image must be preserved exactly: room geometry, layout, proportions, structural elements, window and door positions, and any materials, fixtures, furniture, or details the instructions do not mention.
2. Preserve the camera angle, framing, focal length, perspective, and viewpoint of the source image. (This rule is lifted ONLY when the scene context below specifies a camera angle other than "original".)
3. Do not add, remove, or restyle anything that was not asked for.
4. Maintain photographic/architectural plausibility: correct scale, consistent lighting direction, accurate shadows and reflections.

If an instruction is ambiguous, make the smallest change that satisfies it.`;

const GENERATE_SYSTEM = `You are a precise architectural visualization engine. You generate a new image of a space from the user's description.

RULES:
1. Realize the user's description faithfully, honoring the scene context below (perspective, camera framing, lighting, occupancy).
2. Maintain architectural plausibility: correct scale, consistent lighting, accurate shadows and reflections, coherent spatial geometry.
3. Where reference images are provided, treat them as authoritative for the materials, finishes, objects, or styling they depict.`;

// ---------- Output style (doc 05 §3) ----------

const PHOTOREAL_STYLE = `OUTPUT STYLE: Photorealistic, magazine-quality architectural photography. Lifelike materials and textures, physically accurate lighting, sharp focus, professional composition, true-to-life color. No illustration or painterly effects.`;

const SKETCH_STYLES: Record<SketchMedium, string> = {
  pencil:
    "OUTPUT STYLE: Hand-drawn graphite pencil sketch. Visible pencil strokes, soft shading and hatching, paper texture, monochrome. An architect's freehand study — not photorealistic.",
  "fine-line-fountain-pen":
    "OUTPUT STYLE: Fine-line fountain-pen ink drawing. Crisp confident black line work, light cross-hatching for shadow, white background, architectural illustration style. No color washes, no photorealism.",
  watercolour:
    "OUTPUT STYLE: Architectural watercolour rendering. Loose translucent colour washes over light ink/pencil line work, soft bleeding edges, visible brushwork, white paper showing through. A hand-painted impression — not photorealistic.",
  "magic-marker":
    "OUTPUT STYLE: Marker-rendered architectural sketch. Bold confident marker strokes, flat saturated color blocks, visible streaks, designer presentation-marker style over line work. Not photorealistic.",
};

const SKETCH_TRAILER =
  "Preserve the architectural accuracy and composition of the scene beneath the artistic medium.";

function stylePart(mode: OutputMode, medium: SketchMedium | undefined): string {
  if (mode === "photoreal") return PHOTOREAL_STYLE;
  if (!medium) {
    // Defensive — schema should have rejected this already.
    return PHOTOREAL_STYLE;
  }
  return `${SKETCH_STYLES[medium]} ${SKETCH_TRAILER}`;
}

// ---------- Scene context (doc 05 §4) ----------

const PERSPECTIVE: Record<SourceMode, string> = {
  interior: "first-person interior view, as if standing inside the space",
  isometric:
    "isometric projection — bird's-eye view with all horizontal planes drawn at 30° from the baseline, no perspective convergence",
};

const CAMERA_EDIT: Record<CameraAngle, string> = {
  original:
    "keep the exact camera position, framing, and lens of the source image",
  "wide-angle":
    "re-frame with a wider field of view from a similar position, capturing more of the room",
  "corner-view":
    "position the camera in a corner of the room, looking diagonally across the space",
  "eye-level":
    "position the camera at standing eye level (~1.6 m) with a natural horizontal framing",
  "detail-shot":
    "tight close-up framing on the focal subject of the instructions{maskSubject}",
};

const CAMERA_GENERATE: Record<CameraAngle, string> = {
  original: "a natural, well-composed framing of the space",
  "wide-angle": "wide-angle framing capturing most of the room",
  "corner-view": "corner vantage point looking diagonally across the space",
  "eye-level": "eye-level framing at standing height",
  "detail-shot": "tight close-up on the described focal subject",
};

const LIGHTING: Record<LightMode, string> = {
  daylight:
    "bright natural midday daylight; identify windows and openings and light the space realistically from them",
  night:
    "nighttime; dark exterior, with the space lit by its artificial light sources (lamps, fixtures); identify and switch on plausible interior lighting",
  "golden-hour":
    "golden-hour light; warm, low-angle sun creating long soft shadows and warm tones",
};

const OCCUPANCY: Record<PeopleDensity, string> = {
  none: "no people; an empty space",
  subtle: "one or two people, unobtrusive and naturally placed",
  minor: "a modest number of people, naturally populating the space",
  heavy: "a busy, densely populated scene with many people",
};

const CAMERA_RELEASE_NOTE = `NOTE: The user has requested a camera change; you MAY re-frame as specified above while still preserving the identity of the space and its contents.`;

function sceneContextPart(
  scene: SceneSettings,
  isEdit: boolean,
  hasMask: boolean,
): string {
  const cameraTable = isEdit ? CAMERA_EDIT : CAMERA_GENERATE;
  const cameraTemplate = cameraTable[scene.cameraAngle];
  const cameraText = cameraTemplate.replace(
    "{maskSubject}",
    hasMask ? " (the region indicated by the amendment mask)" : "",
  );

  const lines = [
    "SCENE CONTEXT:",
    `- Perspective: ${PERSPECTIVE[scene.sourceMode]}`,
    `- Camera: ${cameraText}`,
    `- Lighting: ${LIGHTING[scene.lightMode]}`,
    `- Occupancy: ${OCCUPANCY[scene.people]}`,
  ];

  // Camera-lock release: only in edit mode when angle ≠ 'original'.
  if (isEdit && scene.cameraAngle !== "original") {
    lines.push("", CAMERA_RELEASE_NOTE);
  }

  return lines.join("\n");
}

// ---------- User instructions + [REF NN] resolution (doc 05 §5) ----------

// Matches [REF 01], [ref1], [REF-1], [Ref 1], etc. — case-insensitive,
// tolerant of zero-padding and a separator (space, dash, or none).
const REF_TOKEN = /\[\s*ref\s*[-\s]?\s*0*(\d+)\s*\]/gi;

function resolveTokens(
  text: string,
  available: Set<number>,
): { text: string; used: Set<number>; missing: Set<number> } {
  const used = new Set<number>();
  const missing = new Set<number>();
  const resolved = text.replace(REF_TOKEN, (_match, num: string) => {
    const idx = Number.parseInt(num, 10);
    if (available.has(idx)) {
      used.add(idx);
      return `the content shown in reference image ${idx}`;
    }
    missing.add(idx);
    return `(reference ${idx} is unavailable)`;
  });
  return { text: resolved, used, missing };
}

function resolveAndConcat(
  layers: string[],
  available: Set<number>,
): { text: string; used: Set<number>; missing: Set<number> } {
  const used = new Set<number>();
  const missing = new Set<number>();
  const resolvedLines = layers.map((layer, i) => {
    const { text, used: u, missing: m } = resolveTokens(layer, available);
    u.forEach((n) => used.add(n));
    m.forEach((n) => missing.add(n));
    return `${i + 1}. ${text}`;
  });
  const text = [
    "USER INSTRUCTIONS (apply all, in order; later instructions refine earlier ones):",
    ...resolvedLines,
  ].join("\n");
  return { text, used, missing };
}

// ---------- Amendment block (doc 05 §6) ----------

const AMENDMENT_BLOCK = `AMENDMENT TARGET: A mask image is included with the inputs. Modify ONLY the region marked WHITE in the mask. Leave everything in the BLACK region exactly as it appears in the source image, with seamless blending at the mask boundary.

LOCALIZED INSTRUCTION: {localInstruction}`;
