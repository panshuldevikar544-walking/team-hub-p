import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones / other computers on the same Wi-Fi use the dev server (interactivity needs this)
  allowedDevOrigins: ["192.168.29.65", "192.168.*.*"],
};

export default nextConfig;
