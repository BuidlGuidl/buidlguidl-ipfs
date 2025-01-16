const fs = require('fs');
const path = require('path');

const peerPackage = require("@buidlguidl/bgipfs-cli/package.json");
const sourceDir = path.dirname(
  require.resolve("@buidlguidl/bgipfs-cli/package.json")
);
const targetDir = path.join(__dirname, "../public/bgipfs-cli");

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });

// Copy each file from files
peerPackage.hostedFiles.forEach((file) => {
  fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
}); 