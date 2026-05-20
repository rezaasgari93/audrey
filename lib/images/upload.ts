// Upload pipeline: validate → HEIC convert → measure → thumbnail.
// Browser-only (uses canvas, FileReader, dynamic-import heic2any).

import { blobToDataUrl, getImageDimensions, loadImage } from "@/lib/images/blob";

export const ACCEPTED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const ACCEPTED_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"];

export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB per doc 01 §3.1

export type UploadError =
  | { kind: "unsupported-type"; filename: string }
  | { kind: "too-large"; filename: string; bytes: number; max: number }
  | { kind: "decode-failed"; filename: string; reason: string };

export interface ProcessedUpload {
  blob: Blob; // canonical (HEIC → JPEG converted)
  filename: string;
  width: number;
  height: number;
  thumbnailDataUrl: string;
}

function maxBytes(): number {
  const env =
    typeof process !== "undefined"
      ? Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES)
      : NaN;
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_MAX_BYTES;
}

function isAcceptedFile(file: File): boolean {
  if (file.type && ACCEPTED_MIMES.has(file.type.toLowerCase())) return true;
  // Some browsers don't set type for HEIC — fall back to extension.
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
}

function isHeic(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
}

export async function processUpload(
  file: File,
): Promise<{ ok: true; result: ProcessedUpload } | { ok: false; error: UploadError }> {
  if (!isAcceptedFile(file)) {
    return { ok: false, error: { kind: "unsupported-type", filename: file.name } };
  }
  const max = maxBytes();
  if (file.size > max) {
    return {
      ok: false,
      error: { kind: "too-large", filename: file.name, bytes: file.size, max },
    };
  }

  let blob: Blob = file;
  let filename = file.name;

  if (isHeic(file)) {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = (await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.92,
      })) as Blob | Blob[];
      blob = Array.isArray(converted) ? converted[0] : converted;
      filename = filename.replace(/\.(heic|heif)$/i, ".jpg");
    } catch (e) {
      return {
        ok: false,
        error: {
          kind: "decode-failed",
          filename: file.name,
          reason: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }

  let dimensions: { width: number; height: number };
  try {
    dimensions = await getImageDimensions(blob);
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: "decode-failed",
        filename: file.name,
        reason: e instanceof Error ? e.message : "Could not decode image",
      },
    };
  }

  const thumbnailDataUrl = await makeThumbnail(blob, 192);

  return {
    ok: true,
    result: {
      blob,
      filename,
      width: dimensions.width,
      height: dimensions.height,
      thumbnailDataUrl,
    },
  };
}

export async function makeThumbnail(
  blob: Blob,
  maxEdge: number,
): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // Should never happen in modern browsers.
      return await blobToDataUrl(blob);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function describeUploadError(error: UploadError): string {
  switch (error.kind) {
    case "unsupported-type":
      return `Unsupported file type for "${error.filename}". Use PNG, JPEG, WebP, or HEIC.`;
    case "too-large": {
      const mb = (error.bytes / 1024 / 1024).toFixed(1);
      const maxMb = (error.max / 1024 / 1024).toFixed(0);
      return `"${error.filename}" is ${mb} MB — over the ${maxMb} MB limit. Downscale and try again.`;
    }
    case "decode-failed":
      return `Could not decode "${error.filename}": ${error.reason}`;
  }
}
