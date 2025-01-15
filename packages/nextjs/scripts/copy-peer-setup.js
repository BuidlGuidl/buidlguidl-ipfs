const fs = require('fs');
const path = require('path');

const peerPackage = require('@buidlguidl/ipfs-cluster-peer/package.json');
const sourceDir = path.dirname(require.resolve('@buidlguidl/ipfs-cluster-peer/package.json'));
const targetDir = path.join(__dirname, '../public/peer-setup');

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });

// Copy each file from files
peerPackage.files.forEach(file => {
  fs.copyFileSync(
    path.join(sourceDir, file),
    path.join(targetDir, file)
  );
}); 