import type { NextConfig } from "next";

const appUrlHost = process.env.APP_URL
  ? new URL(process.env.APP_URL).host
  : undefined;

const nextConfig: NextConfig = {
  // Minimal server bundle for Docker / Cloud Run (see Dockerfile).
  output: "standalone",
  // Cloud Agent preview and local testing often use 127.0.0.1 while the dev
  // server defaults to localhost. Without this, Turbopack HMR and client
  // hydration scripts are blocked and the UI renders but is not interactive.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "0.0.0.0",
    ...(appUrlHost ? [appUrlHost] : []),
  ],
};

export default nextConfig;
