// CRUD helpers for the single-project / single-gallery v1 workflow.
// Doc 04 §4.1: on first load, create the default project if none exists.

import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/schema";
import {
  DEFAULT_SCENE,
  type Gallery,
  type Project,
  type Render,
} from "@/lib/types";

const DEFAULT_PROJECT_NAME = "Project Aether";
const DEFAULT_GALLERY_NAME = "Primary Gallery";

export async function getOrCreateDefaultProject(): Promise<{
  project: Project;
  gallery: Gallery;
}> {
  const db = getDb();
  const existing = await db.projects.toCollection().first();
  if (existing) {
    const gallery = await db.galleries.get(existing.activeGalleryId);
    if (gallery) return { project: existing, gallery };
    // Lost gallery — recreate.
    const recovered = await createGallery(existing.id, DEFAULT_GALLERY_NAME);
    existing.activeGalleryId = recovered.id;
    await db.projects.put(existing);
    return { project: existing, gallery: recovered };
  }

  const projectId = nanoid();
  const gallery = await createGallery(projectId, DEFAULT_GALLERY_NAME);
  const now = Date.now();
  const project: Project = {
    id: projectId,
    name: DEFAULT_PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
    inputMode: "source",
    sourceImage: null,
    references: [],
    scene: { ...DEFAULT_SCENE },
    masterPrompt: { draft: "", layers: [] },
    activeGalleryId: gallery.id,
  };
  await db.projects.put(project);
  return { project, gallery };
}

async function createGallery(projectId: string, name: string): Promise<Gallery> {
  const db = getDb();
  const gallery: Gallery = {
    id: nanoid(),
    projectId,
    name,
    createdAt: Date.now(),
  };
  await db.galleries.put(gallery);
  return gallery;
}

export async function saveProject(project: Project): Promise<void> {
  const db = getDb();
  project.updatedAt = Date.now();
  await db.projects.put(project);
}

export async function appendRender(render: Render): Promise<void> {
  const db = getDb();
  await db.renders.put(render);
}

export async function listRenders(galleryId: string): Promise<Render[]> {
  const db = getDb();
  return db.renders
    .where("galleryId")
    .equals(galleryId)
    .sortBy("createdAt");
}

export async function getRender(id: string): Promise<Render | undefined> {
  return getDb().renders.get(id);
}

export async function deleteRender(id: string): Promise<void> {
  await getDb().renders.delete(id);
}

export async function clearGalleryRenders(galleryId: string): Promise<void> {
  const db = getDb();
  await db.renders.where("galleryId").equals(galleryId).delete();
}
