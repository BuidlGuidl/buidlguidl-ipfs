// RFC 9727 API catalog, served at /.well-known/api-catalog via a rewrite
// in middleware.ts (route handlers can't live under a dot-directory).

const CATALOG = {
  linkset: [
    {
      anchor: "https://upload.bgipfs.com/api/v0/add",
      "service-doc": [
        {
          href: "https://www.bgipfs.com/SKILL.md",
          type: "text/markdown",
          title: "bgipfs upload guide for AI agents",
        },
      ],
      "service-meta": [
        {
          href: "https://www.bgipfs.com/auth.md",
          type: "text/markdown",
          title: "Authentication (API key or x402/MPP payment)",
        },
      ],
    },
  ],
};

export function GET() {
  return new Response(JSON.stringify(CATALOG, null, 2), {
    headers: {
      "Content-Type": "application/linkset+json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
