import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Served as they are. The image optimizer (/_next/image) is not routed when
     * the site runs as a Vercel Service next to the backend — it answered 404,
     * which broke every <Image> — and the files involved are small already.
     */
    unoptimized: true,
    /**
     * Stop photographs come from Wikimedia — see lib/providers/photos. Only
     * that host, because an allow-list of one is the whole point of the
     * setting: anything else that ends up in an <Image src> is a mistake and
     * should fail loudly rather than be fetched.
     */
    remotePatterns: [{ protocol: "https", hostname: "upload.wikimedia.org" }],
  },
};

export default nextConfig;
