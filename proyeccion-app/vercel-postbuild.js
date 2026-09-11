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

const PAGE_SEO = {
  'index.html': {
    title: 'Panel de Proyección | Cines',
    description: 'Panel central de control y gestión de proyección cinematográfica. Programación semanal, control de salas, eventos, trailers y copias DCP.',
    canonical: 'https://cines.vacaslocas.com.ar/',
    ogImage: '/og-image.jpg',
  },
  'login.html': {
    title: 'Iniciar Sesión | Cines - Gestión de Proyección',
    description: 'Portal de acceso seguro al sistema de gestión de salas de cine, control de proyecciones, programación semanal y mantenimiento técnico.',
    canonical: 'https://cines.vacaslocas.com.ar/login',
    ogImage: '/og-image.jpg',
  },
  'creditos.html': {
    title: 'Créditos y Postcréditos | Cines',
    description: 'Base de datos y buscador inteligente de tiempos de créditos finales y postcréditos para encendido de luces de sala en proyección.',
    canonical: 'https://cines.vacaslocas.com.ar/creditos',
    ogImage: '/og-image.jpg',
  },
  'calendario.html': {
    title: 'Calendario de Proyección | Cines',
    description: 'Calendario de proyecciones, tareas técnicas, inspecciones y eventos programados en salas de cine.',
    canonical: 'https://cines.vacaslocas.com.ar/calendario',
    ogImage: '/og-image.jpg',
  },
  'dcp.html': {
    title: 'Control de DCP y KDM | Cines',
    description: 'Monitoreo, ingesta y control de copias digitales DCP y llaves de seguridad KDM para salas de cine.',
    canonical: 'https://cines.vacaslocas.com.ar/dcp',
    ogImage: '/og-image.jpg',
  },
  'eventos.html': {
    title: 'Eventos y Funciones Especiales | Cines',
    description: 'Gestión, programación y seguimiento de eventos corporativos, avant-premieres y funciones especiales en salas de cine.',
    canonical: 'https://cines.vacaslocas.com.ar/eventos',
    ogImage: '/og-image.jpg',
  },
  'mantenimientos.html': {
    title: 'Mantenimiento y Lámparas | Cines',
    description: 'Control de mantenimiento preventivo, seguimiento de horas de lámparas de proyectores y chequeo semanal de salas de cine.',
    canonical: 'https://cines.vacaslocas.com.ar/mantenimientos',
    ogImage: '/og-image.jpg',
  },
  'rma.html': {
    title: 'Gestión de RMA y Garantías | Cines',
    description: 'Seguimiento de devoluciones técnicas, garantías oficiales y estado de reparación de equipos de cine.',
    canonical: 'https://cines.vacaslocas.com.ar/rma',
    ogImage: '/og-image.jpg',
  },
  'admin-cines.html': {
    title: 'Administración de Cines | Cines',
    description: 'Panel de administración general para la gestión de complejos de cine, salas y asignación de usuarios.',
    canonical: 'https://cines.vacaslocas.com.ar/admin-cines',
    ogImage: '/og-image.jpg',
    noIndex: true,
  },
  'oficinas-calendario.html': {
    title: 'Calendario de Oficinas | Cines',
    description: 'Calendario de coordinación operativa central para oficinas de administración de cines.',
    canonical: 'https://cines.vacaslocas.com.ar/oficinas-calendario',
    ogImage: '/og-image.jpg',
    noIndex: true,
  },
  'oficinas-eventos.html': {
    title: 'Eventos de Oficinas | Cines',
    description: 'Registro y seguimiento centralizado de eventos y funciones especiales coordinadas desde oficinas de cine.',
    canonical: 'https://cines.vacaslocas.com.ar/oficinas-eventos',
    ogImage: '/og-image.jpg',
    noIndex: true,
  },
  '+not-found.html': {
    title: '404 - Página no encontrada | Cines',
    description: 'La página que estás buscando no existe o ha sido movida. Para acceder a los módulos de proyección cinematográfica debes iniciar sesión.',
    canonical: 'https://cines.vacaslocas.com.ar/404',
    ogImage: '/og-image.jpg',
    noIndex: true,
  },
};

function injectStaticSEO(dist) {
  const origin = 'https://cines.vacaslocas.com.ar';
  console.log('🏷️ Injecting static SEO meta tags into HTML files...');

  Object.entries(PAGE_SEO).forEach(([fileName, seo]) => {
    const filePath = path.join(dist, fileName);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    const ogImgUrl = seo.ogImage.startsWith('http') ? seo.ogImage : `${origin}${seo.ogImage}`;
    const robotsContent = seo.noIndex ? 'noindex, nofollow' : 'index, follow';

    const tags = [
      `<title>${seo.title}</title>`,
      `<meta name="description" content="${seo.description}" />`,
      `<link rel="canonical" href="${seo.canonical}" />`,
      `<meta name="robots" content="${robotsContent}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Cines - Sistema de Gestión de Proyección" />`,
      `<meta property="og:url" content="${seo.canonical}" />`,
      `<meta property="og:title" content="${seo.title}" />`,
      `<meta property="og:description" content="${seo.description}" />`,
      `<meta property="og:image" content="${ogImgUrl}" />`,
      `<meta property="og:image:width" content="1376" />`,
      `<meta property="og:image:height" content="768" />`,
      `<meta property="og:image:alt" content="${seo.title}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:url" content="${seo.canonical}" />`,
      `<meta name="twitter:title" content="${seo.title}" />`,
      `<meta name="twitter:description" content="${seo.description}" />`,
      `<meta name="twitter:image" content="${ogImgUrl}" />`,
    ].join('');

    // Remove existing empty title tag
    content = content.replace(/<title[^>]*>.*?<\/title>/gi, '');

    // Inject tags immediately after <head>
    content = content.replace('<head>', `<head>${tags}`);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ ${fileName} -> ${seo.title}`);
  });

  // Also create a 404.html copy of +not-found.html for Vercel / static hosts!
  const notFoundPath = path.join(dist, '+not-found.html');
  const fallback404Path = path.join(dist, '404.html');
  if (fs.existsSync(notFoundPath)) {
    fs.copyFileSync(notFoundPath, fallback404Path);
    console.log('  ✓ 404.html created from +not-found.html');
  }
}

function main() {
  console.log('🚀 Starting Vercel post-build adjustments...');

  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir) && fs.existsSync(distDir)) {
    console.log('📄 Ensuring public assets are in dist...');
    copyRecursiveSync(publicDir, distDir);
    console.log('✅ Public assets verified in dist.');
  }
  
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

    injectStaticSEO(distDir);
  } else {
    console.error('❌ dist directory not found. Make sure build succeeded first!');
  }
  
  console.log('🎉 Vercel post-build adjustments finished successfully!');
}

main();
