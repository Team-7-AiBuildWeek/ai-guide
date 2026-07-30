import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
