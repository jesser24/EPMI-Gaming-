import fs from 'fs';
import path from 'path';
const dist = path.resolve('frontend/dist');
const index = path.join(dist, 'index.html');
if (!fs.existsSync(index)) {
  console.error('frontend/dist/index.html introuvable. Le frontend doit être précompilé avant le déploiement Render.');
  process.exit(1);
}
console.log('Frontend dist found. Render build is ready.');
