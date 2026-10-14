import { readFile } from 'node:fs/promises';
const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [main, html, recording] = await Promise.all(['main.js', 'index.html', 'recording.js'].map(read));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML IDs');
const domText = main.slice(main.indexOf('Object.fromEntries(['), main.indexOf('].map(id =>'));
const required = [...domText.matchAll(/'([^']+)'/g)].map(match => match[1]);
for (const id of required) if (!ids.includes(id)) throw new Error(`Missing DOM node #${id}`);
for (const kind of ['prepare', 'oracle', 'inverse', 'reference', 'forward']) {
  if (!html.includes(`data-circuit-kind="${kind}"`)) throw new Error(`Missing circuit gate ${kind}`);
}
const release = html.match(/src="\.\/main\.js\?v=([^"]+)"/)?.[1];
if (!release) throw new Error('Missing page asset release version');
for (const [, path] of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
  if (!path.endsWith(`?v=${release}`)) throw new Error(`Unversioned page asset: ${path}`);
  await read(path.split('?')[0]);
}
for (const file of ['main.js', 'histogram-renderer.js', 'multiregion-core.js']) {
  for (const [, path] of (await read(file)).matchAll(/from ['"](\.\/[^'"]+)['"]/g)) {
    if (!path.endsWith(`?v=${release}`)) throw new Error(`Mismatched import in ${file}: ${path}`);
    await read(path.slice(2).split('?')[0]);
  }
}
if (/flow-renderer|probability-flow|grover-geometry|loadShader/.test(main)) throw new Error('Histogram must not load physics renderers');
if (!recording.includes('window.BohmianGrover2D') || !recording.includes('ordinary-grover-${side}x${side}-')) throw new Error('Missing recording bridge or filename');
console.log(`${required.length} DOM references and all five circuit gates present; HTML IDs unique.`);
console.log('Histogram assets/versioning valid; physics renderers excluded; recording bridge intact.');
