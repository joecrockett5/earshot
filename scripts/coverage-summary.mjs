// Turns Vitest's coverage-summary.json into a Markdown table for the CI job summary.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) throw new Error('usage: coverage-summary.mjs <coverage-summary.json>');

const summary = JSON.parse(readFileSync(file, 'utf8'));
const groups = new Map();

for (const [name, entry] of Object.entries(summary)) {
  if (name === 'total') continue;
  const [scope, workspace] = path.relative(process.cwd(), name).split(path.sep);
  const key = `${scope}/${workspace}`;
  const group = groups.get(key) ?? { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
  for (const metric of Object.keys(group)) {
    group[metric][0] += entry[metric].covered;
    group[metric][1] += entry[metric].total;
  }
  groups.set(key, group);
}

const percent = ([covered, total]) =>
  total === 0 ? '100%' : `${((covered / total) * 100).toFixed(1)}%`;
const total = summary.total;

console.log('### Coverage\n');
console.log('| Workspace | Lines | Branches | Functions |');
console.log('| --- | ---: | ---: | ---: |');
for (const [key, group] of [...groups].sort()) {
  console.log(
    `| \`${key}\` | ${percent(group.lines)} | ${percent(group.branches)} | ${percent(group.functions)} |`,
  );
}
console.log(
  `| **Total** | **${total.lines.pct}%** | **${total.branches.pct}%** | **${total.functions.pct}%** |`,
);
