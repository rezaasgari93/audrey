// Doc 02 §8.1: source / refs are downsampled before sending to /api/render
// so the request body stays under Vercel's hobby limit (4.5 MB total — and
// one POST carries the source + every referenced image). The original
// full-quality blob stays in IndexedDB.
//
// Two thresholds:
//   - TRANSIT_MAX_EDGE: pixel cap (≤4096 px max edge)
//   - PNG_BYTE_CEILING: even when small enough by pixels, a PNG bigger than
//     this gets re-encoded as JPEG. A 4096×4096 photographic PNG is commonly
//     15–25 MB; base64-inflated it would blow the request limit before the
//     server ever validates the schema.

import { blobToBase64, loadImage } from "@/lib/images/blob";

const TRANSIT_MAX_EDGE = 4096;
const TRANSIT_JPEG_QUALITY = 0.9;
const PNG_BYTE_CEILING = 1.5 * 1024 * 1024; // 1.5 MB — leaves headroom for refs

export async function blobForTransit(
  blob: Blob,
): Promise<{ base64: string; mimeType: string }> {
  const url = URL.createObjectURL(blob);
  let resized: Blob;
  let mimeType: string;
  try {
    const img = await loadImage(url);
    const maxEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const isPng = blob.type === "image/png";
    const needsPixelDownsample = maxEdge > TRANSIT_MAX_EDGE;
    const needsByteRecompress = isPng && blob.size > PNG_BYTE_CEILING;

    if (!needsPixelDownsample && !needsByteRecompress) {
      // Already small enough on both axes.
      if (isPng) {
        resized = blob;
        mimeType = "image/png";
      } else {
        resized = await reencodeAsJpeg(img, img.naturalWidth, img.naturalHeight);
        mimeType = "image/jpeg";
      }
    } else {
      const scale = needsPixelDownsample ? TRANSIT_MAX_EDGE / maxEdge : 1;
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      resized = await reencodeAsJpeg(img, w, h);
      mimeType = "image/jpeg";
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  return { base64: await blobToBase64(resized), mimeType };
}

async function reencodeAsJpeg(
  img: HTMLImageElement,
  w: number,
  h: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob returned null"))),
      "image/jpeg",
      TRANSIT_JPEG_QUALITY,
    );
  });
}
