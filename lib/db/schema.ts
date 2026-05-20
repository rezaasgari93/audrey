// Dexie schema — doc 04 §3.
// Three tables: projects (small metadata + refs), galleries, renders (large blobs).
// Blobs are stored natively; do not base64-encode them for storage.

import Dexie, { type Table } from "dexie";
import type { Project, Gallery, Render } from "@/lib/types";

export class AudreyDB extends Dexie {
  projects!: Table<Project, string>;
  galleries!: Table<Gallery, string>;
  renders!: Table<Render, string>;

  constructor() {
    super("audrey");
    this.version(1).stores({
      // Primary key first, then indexed fields.
      projects: "id, updatedAt",
      galleries: "id, projectId",
      renders: "id, galleryId, createdAt, mode",
    });
  }
}

// Lazy-instantiate so the module is safe to import in a server context
// (Dexie touches `indexedDB` at construction time).
let _db: AudreyDB | null = null;
export function getDb(): AudreyDB {
  if (typeof window === "undefined") {
    throw new Error("AudreyDB is browser-only (IndexedDB is unavailable on the server).");
  }
  if (!_db) _db = new AudreyDB();
  return _db;
}
