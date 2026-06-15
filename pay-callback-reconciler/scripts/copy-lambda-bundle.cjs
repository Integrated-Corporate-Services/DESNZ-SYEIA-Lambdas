const fs = require('fs');
const path = require('path');

function removeGeneratedJsFiles(targetDir) {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      removeGeneratedJsFiles(targetPath);
      continue;
    }

    if (entry.name.endsWith('.js') || entry.name.endsWith('.js.map')) {
      fs.unlinkSync(targetPath);
    }
  }
}

function copyJsFiles(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyJsFiles(sourcePath, targetPath);
      continue;
    }

    if (entry.name.endsWith('.js')) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

removeGeneratedJsFiles('src');
if (fs.existsSync('handler.js')) {
  fs.unlinkSync('handler.js');
}

fs.copyFileSync(path.join('dist', 'handler.js'), 'handler.js');
copyJsFiles(path.join('dist', 'src'), 'src');

console.log('Lambda bundle copied to package root (handler.js + src/**/*.js)');
