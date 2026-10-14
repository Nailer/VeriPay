import type { NextConfig } from "next";

// The documentation lives on Mintlify (built from docs/ in this repo).
// veripay.store/docs and any page under it forward there.
const DOCS_URL = "https://veri-pay.mintlify.app";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/docs", destination: DOCS_URL, permanent: false },
      { source: "/docs/:path*", destination: `${DOCS_URL}/:path*`, permanent: false },
    ];
  },
};

export default nextConfig;
