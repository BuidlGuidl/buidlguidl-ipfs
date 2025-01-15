const fs = require('fs');
const path = require('path');

const files = ['setup.sh', 'docker-compose.yml', 'init.docker-compose.yml', 'init.service.json'];
const sourceDir = path.dirname(require.resolve('@buidlguidl/ipfs-cluster-peer/package.json'));
const targetDir = path.join(__dirname, '../public/peer-setup');

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });

// Copy each file
files.forEach(file => {
  fs.copyFileSync(
    path.join(sourceDir, file),
    path.join(targetDir, file)
  );
}); 