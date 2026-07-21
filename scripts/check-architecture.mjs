import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverRoot = join(root, 'server', 'src');

const ranks = new Map([
  ['types', 0],
  ['constants', 0],
  ['enums', 0],
  ['config', 1],
  ['repositories', 2],
  ['providers', 2],
  ['services', 3],
  ['controllers', 4],
  ['middlewares', 4],
  ['jobs', 4],
  ['routes', 5],
]);

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function layerFor(path) {
  const relativePath = relative(serverRoot, path);
  const firstSegment = relativePath.split(sep)[0];
  if (ranks.has(firstSegment)) return { name: firstSegment, rank: ranks.get(firstSegment) };
  return { name: 'runtime', rank: 6 };
}

function resolveImport(source, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(source), specifier);
  const candidates = [base, `${base}.ts`, join(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const violations = [];
for (const source of filesUnder(serverRoot).filter((path) => extname(path) === '.ts')) {
  const sourceLayer = layerFor(source);
  const code = readFileSync(source, 'utf8');
  const imports = code.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g);
  for (const match of imports) {
    const target = resolveImport(source, match[1]);
    if (!target || !normalize(target).startsWith(normalize(serverRoot))) continue;
    const targetLayer = layerFor(target);
    if (sourceLayer.rank < targetLayer.rank) {
      violations.push(
        `${relative(root, source)} (${sourceLayer.name}) -> ${relative(root, target)} (${targetLayer.name})`,
      );
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    `Server dependency direction violations (lower layers may not import higher layers):\n- ${violations.join('\n- ')}`,
  );
}

console.log('Architecture validation passed: server imports follow the declared layer direction.');
