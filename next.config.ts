import type { NextConfig } from "next";

// No route-handler request-body knob exists in Next.js (the
// experimental.serverActions.bodySizeLimit option only applies to Server
// Actions, not POSTs to /api/* route handlers). The only lever for staying
// under Vercel's 4.5 MB hobby-tier request cap is client-side downsampling
// — see lib/images/downsample.ts.
const nextConfig: NextConfig = {};

export default nextConfig;
