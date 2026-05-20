#!/usr/bin/env tsx
/**
 * Nano Banana Pro sanity check.
 *
 * Per the kickoff: before building UI around the model, confirm two things:
 *   (1) It honors "preserve everything else" — edits ONLY what we name.
 *   (2) It accepts a B/W mask and restricts edits to the WHITE region.
 *
 * Usage:
 *   1. Copy a real interior photo to ./scripts/fixtures/source.jpg
 *      (large enough to read, ~1024×768+; the script downsamples to 1536px max.)
 *   2. GEMINI_API_KEY=... npm run sanity-check
 *   3. Inspect the two outputs in ./scripts/sanity-out/.
 *   4. Open both side-by-side with the source and judge whether the
 *      "preserve" claim holds AND whether the mask was respected.
 *
 * The script intentionally does NOT auto-grade output quality — that's a
 * human judgment call. It just collects evidence and prints what to look for.
 */

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleGenAI } from "@google/genai";

import { buildPrompt } from "../lib/gemini/prompt-template.js";
import type { RenderRequest } from "../lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "source.jpg");
const OUT_DIR = path.join(__dirname, "sanity-out");

const MODEL_ID = process.env.GEMINI_MODEL_ID ?? "gemini-3-pro-image-preview";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("✗ GEMINI_API_KEY is not set. See .env.example.");
    process.exit(1);
  }

  let sourceBuf: Buffer;
  try {
    await stat(FIXTURE_PATH);
    sourceBuf = await readFile(FIXTURE_PATH);
  } catch {
    console.error(
      `✗ No source image at ${FIXTURE_PATH}.\n` +
        "  Drop a real interior photo (JPEG) at that path and re-run.",
    );
    process.exit(1);
  }
  const sourceBase64 = sourceBuf.toString("base64");
  console.log(
    `✓ Loaded source image (${(sourceBuf.byteLength / 1024).toFixed(0)} KB)`,
  );

  await mkdir(OUT_DIR, { recursive: true });

  const client = new GoogleGenAI({ apiKey });

  // ---------- Test 1: "preserve everything else" ----------
  console.log("\n— Test 1: preserve-everything-else —");
  console.log(
    "  Prompt: 'Replace the floor with warm oak planks. Change nothing else.'",
  );
  await runRender({
    client,
    label: "test1-floor-swap",
    request: {
      inputMode: "source",
      mode: "photoreal",
      scene: {
        sourceMode: "interior",
        cameraAngle: "original",
        lightMode: "daylight",
        people: "none",
      },
      promptLayers: [
        "Replace the floor with warm oak planks. Change nothing else.",
      ],
      sourceImageBase64: sourceBase64,
      sourceMimeType: "image/jpeg",
      references: [],
    },
  });

  // ---------- Test 2: mask honored ----------
  console.log("\n— Test 2: amendment mask is respected —");
  console.log(
    "  Mask: a single white square in the LEFT third of the image.",
  );
  console.log(
    "  Prompt: 'Add a large framed artwork on the wall here.'",
  );
  const maskBase64 = await buildLeftThirdMaskBase64(sourceBuf);
  await writeFile(path.join(OUT_DIR, "test2-mask.png"), Buffer.from(maskBase64, "base64"));

  await runRender({
    client,
    label: "test2-mask-honored",
    request: {
      inputMode: "source",
      mode: "photoreal",
      scene: {
        sourceMode: "interior",
        cameraAngle: "original",
        lightMode: "daylight",
        people: "none",
      },
      promptLayers: ["Add a large framed artwork on the wall here."],
      sourceImageBase64: sourceBase64,
      sourceMimeType: "image/jpeg",
      references: [],
      amendment: {
        maskBase64,
        localPrompt: "Add a large framed artwork on the wall here.",
      },
    },
  });

  console.log("\n— Results —");
  console.log(`  Outputs written to: ${OUT_DIR}`);
  console.log("");
  console.log("  Now eyeball each output against the source:");
  console.log("  • Test 1: Only the floor should differ. If walls, ceiling,");
  console.log("    furniture, framing, or lighting visibly drift, the");
  console.log("    'preserve everything else' claim is WEAK — flag to Reza.");
  console.log("  • Test 2: Changes should be confined to the LEFT third of");
  console.log("    the image (the white-mask region). If the model edits");
  console.log("    elsewhere, the mask format/polarity is wrong or the model");
  console.log("    is ignoring it — flag to Reza.");
}

async function runRender(args: {
  client: GoogleGenAI;
  label: string;
  request: RenderRequest;
}) {
  const { client, label, request } = args;
  const { systemPrompt, userParts } = buildPrompt(request);
  const t0 = Date.now();
  const response = await client.models.generateContent({
    model: MODEL_ID,
    contents: [{ role: "user", parts: userParts }],
    config: {
      systemInstruction: systemPrompt,
      responseModalities: ["IMAGE"],
      imageConfig: { imageSize: "2K" }, // 2K is fine for sanity; saves a few cents.
    },
  });
  const elapsed = Date.now() - t0;

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(
    (p): p is { inlineData: { mimeType?: string; data?: string } } =>
      typeof p === "object" && p !== null && "inlineData" in p,
  );

  if (!imagePart?.inlineData?.data) {
    console.error(
      `  ✗ ${label}: no image returned (${elapsed} ms). Block reason: ${response.promptFeedback?.blockReason ?? "unknown"}`,
    );
    return;
  }

  const mime = imagePart.inlineData.mimeType ?? "image/png";
  const ext = mime === "image/jpeg" ? "jpg" : "png";
  const outPath = path.join(OUT_DIR, `${label}.${ext}`);
  await writeFile(outPath, Buffer.from(imagePart.inlineData.data, "base64"));
  console.log(`  ✓ ${label}: ${elapsed} ms → ${outPath}`);
}

/**
 * Build a same-size B/W PNG with a white square covering the left third.
 * Uses a tiny hand-rolled PNG encoder so this script has no extra deps
 * beyond what the app already has. We read the source's pixel dimensions
 * lightly from its JPEG SOF marker so the mask matches.
 */
async function buildLeftThirdMaskBase64(jpegBuf: Buffer): Promise<string> {
  const { width, height } = readJpegSize(jpegBuf);
  const pixels = new Uint8Array(width * height);
  const cutoff = Math.floor(width / 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = x < cutoff ? 255 : 0;
    }
  }
  const png = encodeGrayscalePng(pixels, width, height);
  return Buffer.from(png).toString("base64");
}

function readJpegSize(buf: Buffer): { width: number; height: number } {
  // Walk JPEG markers until we hit an SOFn (0xC0..0xCF except 0xC4/0xC8/0xCC).
  let i = 2; // skip SOI
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error("Invalid JPEG (no marker)");
    const marker = buf[i + 1];
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    const segLen = buf.readUInt16BE(i + 2);
    i += 2 + segLen;
  }
  throw new Error("Could not read JPEG dimensions");
}

function encodeGrayscalePng(
  pixels: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  // Minimal PNG: IHDR (color type 0 = grayscale) + IDAT (uncompressed via
  // zlib with deflate stored blocks would require zlib; use Node's zlib).
  const { deflateSync } = require("node:zlib") as typeof import("node:zlib");

  // Filter byte 0 (None) per row, then row bytes.
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const compressed = deflateSync(Buffer.from(raw));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // signature
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const { crc32 } = require("node:zlib") as typeof import("node:zlib") & {
    crc32: (data: Buffer) => number;
  };
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  // crc32 exists in Node ≥18; fall back to a hand-rolled CRC if absent.
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = typeof crc32 === "function" ? crc32(crcInput) : crc32Manual(crcInput);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32Manual(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return c ^ 0xffffffff;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
