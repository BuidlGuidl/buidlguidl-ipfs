import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sourceDir = path.dirname(require.resolve("bgipfs/package.json"));
const targetDir = path.join(__dirname, "../public/cli");

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(
  path.join(sourceDir, "install.sh"),
  path.join(targetDir, "install.sh")
);
