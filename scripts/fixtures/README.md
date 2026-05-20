# Sanity-check fixtures

Drop a real interior photo here as **`source.jpg`** before running:

```
GEMINI_API_KEY=... npm run sanity-check
```

The script runs two tests against Nano Banana Pro:

1. **Preserve-everything-else** — asks the model to swap only the floor and inspects whether it leaves the rest alone.
2. **Mask honored** — sends a B/W mask covering the left third and asks for an artwork "here"; verifies the edit stays inside the white region.

Outputs land in `../sanity-out/`. The script doesn't grade them — you eyeball each result against the source. The kickoff says: "Flag me if either doesn't hold."

A good source image:
- Clear interior with floor, walls, furniture visible.
- ~1024–2048 px on the long edge is plenty.
- JPEG (not HEIC — Node can't decode HEIC out of the box and we don't need to here).
