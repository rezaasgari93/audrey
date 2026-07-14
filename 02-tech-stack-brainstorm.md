# Audrey — Tech Stack Decision (Single User)

> **Status:** Locked v1.0 — decision made. *(File kept under the original `brainstorm` filename because the sandbox can't rename; treat as the canonical tech-stack doc.)*
> **Purpose:** Specify the exact stack, packages, and project structure Claude Code should use to build Audrey.

---

## 1. Decision summary

**Build with Next.js (App Router) on Vercel, in TypeScript, with the official `@google/genai` SDK proxying calls to Gemini server-side, and IndexedDB for client persistence.**

This is "Option B" from the original brainstorm in this file. The reasoning: the UI is bespoke (canvas drawing, drag-handle comparison slider, layered prompt history), the user wants tablet/stylus access (which a real URL serves cleanly), the API key must stay off the browser, and Vercel's free tier covers single-user usage at no cost. The stack is forward-compatible — adding accounts, multi-user sync, or a database later requires additions rather than rewrites.

---

## 2. Packages

### 2.1 Runtime / framework

| Package                     | Version (min)         | Purpose                                                        |
| --------------------------- | --------------------- | -------------------------------------------------------------- |
| `next`                      | 15.x                  | App Router framework. Server proxy + React frontend in one.    |
| `react`, `react-dom`        | 19.x                  | UI library. Comes with Next.                                   |
| `typescript`                | 5.x                   | Type safety across the codebase.                               |
| `tailwindcss`               | 4.x                   | Utility-first styling. Matches the prototype's visual density. |
| `@google/genai`             | latest                | Official Node SDK for Gemini / Nano Banana Pro.                |

### 2.2 Client utilities

| Package                     | Purpose                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `idb-keyval` *or* `dexie`   | IndexedDB wrapper for project/render persistence. `dexie` if a real schema is wanted; `idb-keyval` if simpler suffices. **Recommendation: `dexie`** — the data model (see [04-data-model.md](04-data-model.md)) has several related entities, and Dexie's indexes save effort. |
| `react-compare-slider` *or* hand-rolled | Comparison view slider. **Recommendation: hand-rolled** — it's ~50 LOC and avoids a dependency for something this central to the UX. |
| `lucide-react`              | Icon set. Lightweight, matches the prototype's clean aesthetic.                                        |
| `zod`                       | Schema validation for the API route inputs (sanity-check before calling Gemini).                       |
| `nanoid`                    | ID generation for projects, renders, references.                                                       |
| `zustand` *(optional)*      | Lightweight state management if `useReducer` proves unwieldy. Defer until needed.                      |

### 2.3 What we explicitly DON'T need

- A database (IndexedDB is sufficient for single user).
- Auth (single user, no accounts).
- A separate image upload service (browser → Next API route handles it).
- Redux / React Query / SWR (no remote data fetching beyond the model call, which is a one-shot user-initiated POST).
- A canvas library like Fabric.js. Plain `<canvas>` + pointer events handles freehand drawing fine.
- An upscaler (Nano Banana Pro outputs 4K natively).

---

## 3. Project structure

```
audrey/
├── app/
│   ├── layout.tsx                 // Root layout, fonts, global styles
│   ├── page.tsx                   // Single-page app entry (Audrey workspace)
│   ├── api/
│   │   └── render/
│   │       └── route.ts           // POST endpoint: takes inputs, calls Gemini, returns image
│   └── globals.css
├── components/
│   ├── workspace/
│   │   ├── InputPanel.tsx         // Left column container
│   │   ├── SourceEmptyButtons.tsx
│   │   ├── MasterPrompt.tsx
│   │   ├── PromptHistory.tsx
│   │   ├── ReferenceGallery.tsx
│   │   ├── ScenePanel.tsx
│   │   └── FeedbackPanel.tsx
│   ├── output/
│   │   ├── OutputArea.tsx         // Center column container
│   │   ├── TabBar.tsx
│   │   ├── ComparisonView.tsx
│   │   ├── AmendmentMaskCanvas.tsx
│   │   ├── CropTool.tsx
│   │   ├── HistoryStrip.tsx
│   │   └── PipelineBar.tsx        // Bottom render-pipeline action bar
│   └── ui/                         // Generic primitives: Button, Modal, Toast, etc.
├── lib/
│   ├── db/
│   │   ├── schema.ts              // Dexie schema (see 04-data-model.md)
│   │   └── projects.ts            // CRUD helpers
│   ├── gemini/
│   │   ├── client.ts              // Server-side @google/genai client setup
│   │   ├── render.ts              // Orchestrates a render call
│   │   └── prompt-template.ts     // Builds the actual prompt text (see 05-prompt-template.md)
│   ├── images/
│   │   ├── crop.ts                // Client-side crop
│   │   ├── mask.ts                // Mask normalization for the API
│   │   └── download.ts            // Save-to-disk helper
│   └── types.ts                   // Shared types (see 04-data-model.md)
├── public/                         // Static assets
├── .env.local                      // Local dev secrets (not committed)
├── .env.example                    // Documented env vars (committed)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 4. Environment variables

| Name                          | Required | Where used        | Purpose                                                                |
| ----------------------------- | -------- | ----------------- | ---------------------------------------------------------------------- |
| `GEMINI_API_KEY`              | Yes      | Server only       | Auth for Gemini. Obtain from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL_ID`             | No       | Server only       | Defaults to `gemini-3-pro-image-preview`. Overridable for testing.     |
| `FEEDBACK_RECIPIENT_EMAIL`    | No       | Client (build-time public env var) | Recipient address for the Learning & Improvement `mailto:` link. |
| `MAX_UPLOAD_BYTES`            | No       | Both              | Defaults to 25 MB. Enforced client-side and validated server-side.     |

Use `.env.example` to document required vars; `.env.local` for local development. On Vercel, set these in the project's Environment Variables UI.

---

## 5. The render API route (sketch)

A single POST endpoint, `/api/render`, handles every model call:

```ts
// app/api/render/route.ts (sketch — not final code)
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { renderRequestSchema } from '@/lib/types';
import { buildPrompt } from '@/lib/gemini/prompt-template';

export const runtime = 'nodejs'; // Not edge — Gemini SDK needs Node APIs

export async function POST(req: NextRequest) {
  const body = await req.json();
  const input = renderRequestSchema.parse(body); // zod validation

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const { systemPrompt, userParts } = buildPrompt(input);

  const response = await client.models.generateContent({
    model: process.env.GEMINI_MODEL_ID ?? 'gemini-3-pro-image-preview',
    contents: [{ role: 'user', parts: userParts }],
    config: { systemInstruction: systemPrompt },
  });

  // Extract the image part from the response and return as base64
  const imagePart = response.candidates?.[0]?.content?.parts?.find(p => 'inlineData' in p);
  if (!imagePart) {
    return NextResponse.json({ error: 'No image in response' }, { status: 502 });
  }

  return NextResponse.json({
    imageBase64: imagePart.inlineData!.data,
    mimeType: imagePart.inlineData!.mimeType,
    durationMs: /* …measured… */,
  });
}
```

Multi-turn / chat-style layering is handled by sending the prompt-history layers as a single user message rather than maintaining a chat object server-side. This keeps the API stateless and lets all state live in the browser. See [05-prompt-template.md](05-prompt-template.md) for how layers are concatenated.

---

## 6. State management

- **Project state** (current source, references, scene settings, master prompt, history) lives in a single React context backed by Dexie. On every mutation, we (a) update the in-memory state and (b) async-write to IndexedDB.
- **Transient UI state** (active tab, mask-in-progress, crop frame) is local component state — no need to persist.
- **No server-side session.** The render API route is fully stateless. The client owns history.

---

## 7. Build, run, deploy

| Step       | Command / action                                             |
| ---------- | ------------------------------------------------------------ |
| Install    | `pnpm install` (or `npm install`).                           |
| Dev        | `pnpm dev` → http://localhost:3000.                          |
| Lint/types | `pnpm lint && pnpm tsc --noEmit`.                            |
| Build      | `pnpm build`.                                                |
| Deploy     | `git push` to a Vercel-connected repo. Set env vars in the Vercel project UI. |

The free Vercel hobby tier is enough for single-user usage. Function timeout limits: default 10s on hobby; Nano Banana Pro renders can occasionally exceed this for complex compositions. **Set the `maxDuration` export on the render route to 60s** to be safe.

```ts
// app/api/render/route.ts
export const maxDuration = 60;
```

---

## 8. Known constraints / things to watch

1. **Vercel request body size limit (4.5 MB on hobby tier).** A 25 MB source image + a few references will exceed this. **Mitigation:** the client downsamples uploads to ≤ 4096 px max dimension before sending to `/api/render`, and uses progressive JPEG quality (~90) for transit. Original full-quality files stay in IndexedDB for re-use. *(This is the only non-trivial implementation detail Claude Code should not miss.)*
2. **Function memory.** Vercel hobby = 1 GB. Should be enough for one render at a time. Monitor.
3. **The model is in Preview.** Wrap the API call in a clean error boundary and surface failures to the user with a Retry button (already specified in §4.2 of [01-core-features.md](01-core-features.md)).
4. **CORS / same-origin.** Not an issue — the browser only talks to the same-origin Next API route, which talks to Gemini server-side.
5. **HEIC uploads** need a polyfill or server-side conversion (browsers don't decode HEIC). Use the [`heic2any`](https://www.npmjs.com/package/heic2any) library client-side to convert HEIC → JPEG before storing or sending.

---

## 9. Why not the alternatives (one-liners)

- **Pure local Vite app (Option A in the brainstorm):** doesn't give a tablet a URL to hit without LAN tunneling. Reza wants stylus support; tablet matters.
- **Gradio (Option C):** can't deliver the bespoke UI — comparison slider, freehand mask, prompt history — without escape hatches that defeat the point.
- **Vite + separate FastAPI backend:** two codebases for no benefit at this size.
- **Next.js without TypeScript:** TS catches the kind of data-model mistakes that this app — with layered prompt history and reference re-numbering — is prone to.

---

## Changelog

- **v1.0** — Locked the decision: Next.js + Vercel + TypeScript + Tailwind + @google/genai + Dexie (IndexedDB). Specified packages, project structure, env vars, API route sketch, deploy steps, known constraints.
- **v0.1** — Initial brainstorm of three options.
