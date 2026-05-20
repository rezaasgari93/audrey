import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Doc 02 §8.1: source/refs are downsampled client-side to ≤4096px and
  // sent as base64. With several refs the payload can exceed Next's default
  // 1MB body limit on Server Actions; the /api/render route uses req.json()
  // (not a Server Action), but we still bump the experimental body limit
  // for safety. Vercel hobby caps at 4.5MB regardless — keep client downsampling.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
