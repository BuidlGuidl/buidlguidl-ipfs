// Markdown-for-agents versions of the public pages. Requests with
// `Accept: text/markdown` are rewritten here by middleware.ts.

const PAGES: Record<string, string> = {
  index: `# BuidlGuidl IPFS — a toolkit for uploading to decentralised storage

## ipfs-uploader

A simple TypeScript library for uploading data in varying formats to
multiple different data providers.

- Install: \`pnpm add ipfs-uploader\`
- Docs: https://github.com/buidlguidl/buidlguidl-ipfs/tree/main/packages/ipfs-uploader

## bgipfs

A CLI for running IPFS clusters and uploading to IPFS.

- Install with curl: \`curl -fsSL https://bgipfs.com/cli/install.sh | sh\`
- Or with a package manager: \`pnpm add bgipfs\`
- Docs: https://github.com/buidlguidl/buidlguidl-ipfs/tree/main/packages/bgipfs

## bgipfs.com

A simple IPFS pinning service to help developers get started.

- Try a demo upload: https://www.bgipfs.com/upload
- Sign in to get an API key: https://www.bgipfs.com

## For AI agents

- Upload guide (agent skill): https://www.bgipfs.com/SKILL.md
- Authentication: https://www.bgipfs.com/auth.md
- Site overview: https://www.bgipfs.com/llms.txt
`,
  upload: `# Demo upload — bgipfs.com

This page lets a human try a small demo upload to IPFS in the browser,
without an account.

Agents should upload via the API instead:

- Follow the guide at https://www.bgipfs.com/SKILL.md
- Authentication options (API key or x402/MPP payment): https://www.bgipfs.com/auth.md
- Upload endpoint: https://upload.bgipfs.com (kubo \`/api/v0/add\`-compatible)
- Files are served at https://{cid}.ipfs.community.bgipfs.com/
`,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(page, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
    },
  });
}
