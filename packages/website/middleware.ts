import { NextRequest, NextResponse } from "next/server";

// Paths that have a Markdown-for-agents equivalent, mapped to the slug of
// the route handler in app/agent/markdown/[slug]/route.ts.
const MARKDOWN_PAGES: Record<string, string> = {
  "/": "index",
  "/upload": "upload",
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Markdown content negotiation: serve text/markdown to agents that ask
  // for it (https://developers.cloudflare.com/agents/markdown-for-agents/).
  const markdownSlug = MARKDOWN_PAGES[pathname];
  if (markdownSlug) {
    const accept = request.headers.get("accept") ?? "";
    if (accept.includes("text/markdown")) {
      const url = request.nextUrl.clone();
      url.pathname = `/agent/markdown/${markdownSlug}`;
      return NextResponse.rewrite(url);
    }
  }

  // RFC 9727 API catalog (route handlers can't live under a dot-directory,
  // so rewrite the well-known path to a regular route).
  if (pathname === "/.well-known/api-catalog") {
    const url = request.nextUrl.clone();
    url.pathname = "/agent/api-catalog";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/upload", "/.well-known/api-catalog"],
};
