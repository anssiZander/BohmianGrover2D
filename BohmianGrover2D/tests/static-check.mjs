import { readFile } from 'node:fs/promises';
const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [main, html, geometry, recording] = await Promise.all(['main.js', 'index.html', 'grover-geometry.js', 'recording.js'].map(read));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML IDs');
const domText = main.slice(main.indexOf('Object.fromEntries(['), main.indexOf('].map(id =>'));
const required = [...domText.matchAll(/'([^']+)'/g)].map(match => match[1]);
for (const id of required) if (!ids.includes(id)) throw new Error(`Missing DOM node #${id}`);
const nodeText = geometry.slice(geometry.indexOf('Object.fromEntries(['), geometry.indexOf('].map(name =>'));
for (const [, name] of nodeText.matchAll(/'([^']+)'/g)) if (!html.includes(`data-geometry="${name}"`)) throw new Error(`Missing sphere node ${name}`);
const flow = await read('flow-renderer.js');
const shaders = [...new Set([...(main + flow).matchAll(/loadShader\('([^']+)'\)/g)].map(match => match[1]))];
for (const shader of shaders) {
  const source = await read(`shaders/${shader}`);
  if (!shader.endsWith('.glsl') && !source.startsWith('#version 300 es')) throw new Error(`${shader}: missing GLSL version`);
  if ([...source].filter(c => c === '{').length !== [...source].filter(c => c === '}').length) throw new Error(`${shader}: unbalanced braces`);
}
for (const [, path] of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) await read(path);
if (!recording.includes('window.BohmianGrover2D') || !recording.includes('grover-multiregion-4x4-')) throw new Error('Missing recording bridge or filename');
console.log(`${required.length} DOM references and all sphere nodes present; HTML IDs unique.`);
console.log(`${shaders.length} WebGL2 shader sources and all local page assets present; recording bridge intact.`);
