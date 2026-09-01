// Generates /.well-known/agent-skills/index.json from public/SKILL.md,
// per the Agent Skills discovery RFC (v0.2.0):
// https://github.com/cloudflare/agent-skills-discovery-rfc
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");

const skillPath = path.join(publicDir, "SKILL.md");
const skill = fs.readFileSync(skillPath);

const name = /^name:\s*(.+)$/m.exec(skill.toString())?.[1]?.trim();
const description = /^description:\s*(.+)$/m.exec(skill.toString())?.[1]?.trim();
if (!name || !description) {
  throw new Error("public/SKILL.md must have name and description frontmatter");
}

const digest = crypto.createHash("sha256").update(skill).digest("hex");

const index = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name,
      type: "skill-md",
      description,
      url: "/SKILL.md",
      digest: `sha256:${digest}`,
    },
  ],
};

const outDir = path.join(publicDir, ".well-known/agent-skills");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "index.json");
fs.writeFileSync(outPath, JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${name})`);
