import { mkdir, cp } from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function prepareExportAssets(root = fileURLToPath(new URL('../',import.meta.url))) {
  const target=path.join(root,'public/vendor/docx');
  await mkdir(target,{recursive:true});
  await cp(path.join(root,'node_modules/docx/dist/index.mjs'),path.join(target,'index.mjs'));
  await cp(path.join(root,'node_modules/docx/LICENSE'),path.join(target,'LICENSE'));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await prepareExportAssets();
