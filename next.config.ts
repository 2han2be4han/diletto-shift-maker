import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/diletto-shift-maker',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
