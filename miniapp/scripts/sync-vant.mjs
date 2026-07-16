import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const candidates = [
  join(workspaceRoot, 'node_modules', '@vant', 'weapp', 'dist'),
  join(workspaceRoot, '..', 'node_modules', '@vant', 'weapp', 'dist'),
];
const source = candidates.find((candidate) => existsSync(candidate));

if (!source) {
  throw new Error('Unable to find @vant/weapp/dist. Run npm install from the repository root.');
}

const target = join(workspaceRoot, 'src', 'wxcomponents', 'vant');
rmSync(target, { force: true, recursive: true });
cpSync(source, target, { recursive: true });
