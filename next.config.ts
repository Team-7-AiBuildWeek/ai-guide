import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Served as they are. The image optimizer (/_next/image) is not routed when
     * the site runs as a Vercel Service next to the backend — it answered 404,
     * which broke every <Image> — and the files involved are small already
     * (stop photos are requested from Wikimedia at a fixed thumbnail size).
     */
    unoptimized: true,
  },
};

export default nextConfig;
