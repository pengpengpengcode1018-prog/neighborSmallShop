import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requiredFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/DESIGN.md',
  'docs/FRONTEND.md',
  'docs/PLANS.md',
  'docs/PRODUCT_SENSE.md',
  'docs/QUALITY_SCORE.md',
  'docs/RELIABILITY.md',
  'docs/SECURITY.md',
  'docs/design-docs/core-beliefs.md',
  'docs/design-docs/index.md',
  'docs/exec-plans/active/index.md',
  'docs/exec-plans/completed/index.md',
  'docs/exec-plans/tech-debt-tracker.md',
  'docs/generated/db-schema.md',
  'docs/product-specs/feature-list.json',
  'docs/product-specs/index.md',
  'docs/references/requirements-traceability.md',
];

const missing = requiredFiles.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) {
  throw new Error(`Missing required repository knowledge files:\n- ${missing.join('\n- ')}`);
}

const activeDirectory = join(root, 'docs/exec-plans/active');
const activePlans = readdirSync(activeDirectory).filter(
  (name) => name.endsWith('.md') && name !== 'index.md',
);
if (activePlans.length !== 1) {
  throw new Error(`Expected exactly one active plan, found ${activePlans.length}.`);
}

const featureList = JSON.parse(
  readFileSync(join(root, 'docs/product-specs/feature-list.json'), 'utf8'),
);
const allowedStatuses = new Set(['not_started', 'in_progress', 'blocked', 'passing']);
const invalidFeatures = featureList.features.filter(
  (feature) => !feature.id || !allowedStatuses.has(feature.status),
);
if (invalidFeatures.length > 0) {
  throw new Error('Feature list contains an invalid id or status.');
}
const inProgress = featureList.features.filter((feature) => feature.status === 'in_progress');
if (inProgress.length > 1) {
  throw new Error('Only one feature may be in_progress at a time.');
}

const placeholders = ['[替换', '[domain-', 'YYYY-MM-DD-short-topic'];
const markdownFiles = requiredFiles.filter((path) => path.endsWith('.md'));
for (const relativePath of markdownFiles) {
  const contents = readFileSync(join(root, relativePath), 'utf8');
  const placeholder = placeholders.find((candidate) => contents.includes(candidate));
  if (placeholder) {
    throw new Error(`${relativePath} still contains template placeholder ${placeholder}.`);
  }
}

console.log(
  `Docs validation passed: ${requiredFiles.length} required files, ${featureList.features.length} features, active plan ${activePlans[0]}.`,
);
