// Doc 02 §8.1: source / refs are downsampled to ≤4096 px max edge before
// sending to /api/render so the request body stays under Vercel's hobby
// limit (4.5 MB). The original full-quality blob stays in IndexedDB.

import { blobToBase64, loadImage } from "@/lib/images/blob";

const TRANSIT_MAX_EDGE = 4096;
const TRANSIT_JPEG_QUALITY = 0.9;

export async function blobForTransit(
  blob: Blob,
): Promise<{ base64: string; mimeType: string }> {
  // Need dimensions to decide whether to downsample.
  const url = URL.createObjectURL(blob);
  let resized: Blob;
  let mimeType: string;
  try {
    const img = await loadImage(url);
    const maxEdge = Math.max(img.naturalWidth, img.naturalHeight);
    if (maxEdge <= TRANSIT_MAX_EDGE) {
      // Already small enough — but normalize PNG with alpha to keep as PNG,
      // everything else as JPEG to keep payload reasonable.
      const keepPng = blob.type === "image/png";
      if (keepPng) {
        resized = blob;
        mimeType = "image/png";
      } else {
        resized = await reencodeAsJpeg(img, img.naturalWidth, img.naturalHeight);
        mimeType = "image/jpeg";
      }
    } else {
      const scale = TRANSIT_MAX_EDGE / maxEdge;
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
