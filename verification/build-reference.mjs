import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
const inputDir=path.join(root,'input_data');
const outputDir=path.join(root,'verification','bootstrap-output','output');
await fs.rm(path.dirname(outputDir),{recursive:true,force:true});
await fs.mkdir(path.dirname(outputDir),{recursive:true});
const moduleUrl=new URL('../implementation/build_redirect_map.mjs',import.meta.url);
const module=await import(moduleUrl.href);
await module.buildShortlinks(inputDir,outputDir,fileURLToPath(moduleUrl));
