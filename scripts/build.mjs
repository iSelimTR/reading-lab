import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(path.join(root, 'public'), destination, { recursive: true, dereference: true });
await mkdir(path.join(destination, 'src'), { recursive: true });
await cp(path.join(root, 'src/questions.js'), path.join(destination, 'src/questions.js'));
for (const [source, target] of [
  ['pdfjs-dist', 'pdfjs'], ['tesseract.js/dist', 'tesseract'], ['tesseract.js-core', 'tesseract-core']
]) {
  await cp(path.join(root, 'node_modules', source), path.join(destination, 'vendor', target), { recursive: true, dereference: true });
}
await mkdir(path.join(destination, 'vendor/docx'), { recursive: true });
await cp(path.join(root, 'node_modules/docx/dist/index.mjs'), path.join(destination, 'vendor/docx/index.mjs'));
await cp(path.join(root, 'node_modules/docx/LICENSE'), path.join(destination, 'vendor/docx/LICENSE'));
console.log('Built dist/ for GitHub Pages. AI mode requires the Node server.');
