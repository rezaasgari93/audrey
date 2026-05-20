// Save-to-disk helper. Browser-only.
// Doc 01 §4.4: filename audrey_<project-slug>_<timestamp>_<mode>.png

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "project";
}

export function defaultFilename(args: {
  projectName: string;
  mode: "render" | "sketch";
  date?: Date;
}): string {
  const d = args.date ?? new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `audrey_${slugify(args.projectName)}_${stamp}_${args.mode}.png`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the click handler has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
