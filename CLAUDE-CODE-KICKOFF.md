# Claude Code Kickoff Prompt

Paste the block below into Claude Code, pointed at this folder.

---

I'm building **Audrey**, a single-user web app that uses Google's Nano Banana Pro (`gemini-3-pro-image-preview`) to edit and generate architectural images. The complete spec is in this folder.

**Start by reading `00-README.md`** — it's the entry point and lays out the reading order, the locked tech stack, v1 scope, and a suggested build order. Then read docs 01–06 before writing any code.

Build the v1 scope as defined in the README. Key things to respect:

- Stack is locked: Next.js (App Router) + TypeScript + Tailwind on Vercel, `@google/genai` via a stateless `/api/render` route, Dexie/IndexedDB for storage. No auth, no server DB (single user).
- The core promise is faithful modification — change only what's asked, preserve everything else. The prompt template (doc 05) encodes this; treat it as the source of truth and expect to tune it against real outputs.
- **Map** and **Life Engine** are deferred — build them behind a feature flag, hidden, per the README.

Before building around the model, do a quick sanity check that Nano Banana Pro honors the "preserve everything else" instruction and accepts a black/white mask for region edits (doc 03 §8). Flag me if either doesn't hold.

Follow the 9-step build order in the README. Milestone 4 (upload → prompt → photoreal render → compare → save) is the first end-to-end usable cut — pause there so I can try it before you continue.
