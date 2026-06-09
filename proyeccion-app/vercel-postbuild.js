const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const srcDir = path.join(distDir, 'assets', 'node_modules');
const destDir = path.join(distDir, 'assets', 'v-assets');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function replaceInFileSync(filePath, search, replacement) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(search)) {
      console.log(`Patching file: ${path.relative(distDir, filePath)}`);
      const updatedContent = content.split(search).join(replacement);
      fs.writeFileSync(filePath, updatedContent, 'utf8');
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

function processDirectory(directory, search, replacement) {
  if (!fs.existsSync(directory)) return;
  fs.readdirSync(directory).forEach((file) => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules') {
        processDirectory(fullPath, search, replacement);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.js', '.html', '.css', '.json'].includes(ext)) {
        replaceInFileSync(fullPath, search, replacement);
      }
    }
  });
}

function main() {
  console.log('🚀 Starting Vercel post-build adjustments...');
  
  if (!fs.existsSync(srcDir)) {
    console.log('⚠️ No assets found in assets/node_modules. Skipping copy.');
  } else {
    console.log(`📦 Copying assets from ${srcDir} to ${destDir}...`);
    copyRecursiveSync(srcDir, destDir);
    console.log('✅ Copy complete.');
  }
  
  console.log('✍️ Updating references in generated files...');
  if (fs.existsSync(distDir)) {
    processDirectory(distDir, 'assets/node_modules', 'assets/v-assets');
    processDirectory(distDir, 'assets%2Fnode_modules', 'assets%2Fv-assets');
    console.log('✅ References updated.');
    
    if (fs.existsSync(srcDir)) {
      console.log('🧹 Removing original node_modules assets folder to clean up dist...');
      fs.rmSync(srcDir, { recursive: true, force: true });
      console.log('✅ Cleanup complete.');
    }
  } else {
    console.error('❌ dist directory not found. Make sure build succeeded first!');
  }
  
  console.log('🎉 Vercel post-build adjustments finished successfully!');
}

main();
