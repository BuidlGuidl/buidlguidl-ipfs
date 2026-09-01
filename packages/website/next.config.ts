import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Agent/crawler discovery links on the main pages.
        source: "/(upload)?",
        headers: [
          {
            key: "Link",
            value: [
              '<https://www.bgipfs.com/sitemap.xml>; rel="sitemap"; type="application/xml"',
              '<https://www.bgipfs.com/llms.txt>; rel="llms-txt"; type="text/plain"',
              '<https://www.bgipfs.com/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
              '<https://www.bgipfs.com/SKILL.md>; rel="service-doc"; type="text/markdown"',
            ].join(", "),
          },
          // Responses differ based on Accept (markdown for agents).
          { key: "Vary", value: "Accept" },
        ],
      },
      {
        // Let browser-based agents fetch discovery files cross-origin.
        source: "/:path(SKILL.md|auth.md|llms.txt)",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        source: "/.well-known/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
