import fs from 'node:fs/promises';
import path from 'node:path';

const inputDir = path.resolve(process.argv[2] ?? 'input_data');
const outputDir = path.resolve(process.argv[3] ?? 'output');

throw new Error(`请完成短链迁移逻辑，输入目录为${inputDir}，输出目录为${outputDir}`);
