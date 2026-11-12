import { mkdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';

// Reuse the Map document and its exact asset graph. A second bundled Map entry
// would move MapLibre into shared chunks also downloaded by Netgraph.
const html = await readFile('dist/index.html', 'utf8');
const manifest = JSON.parse(await readFile('dist/.vite/manifest.json','utf8'));
for (const [entryKey, flag, title, directory] of [['src/terminal.ts','terminal','Terminal','terminal'],['src/fly3d.ts','fly3d','Fly 3D','fly-3d']]) {
const entry = manifest[entryKey];
if(!entry?.isEntry || !/^assets\/[\w.-]+\.js$/.test(entry.file))throw new Error(`${title} entry missing from build manifest`);
const visited=new Set(), css=new Set();
let hasStyle=false;
function collect(chunk) {
  for(const id of chunk.imports??[]) { if(visited.has(id))continue;visited.add(id);if(!manifest[id])throw new Error(`Missing ${title} import`);collect(manifest[id]); }
  for(const path of chunk.css??[]) {if(!/^assets\/[\w.-]+\.css$/.test(path))throw new Error(`Invalid ${title} CSS`);hasStyle=true;if(!html.includes(`href="/${path}"`))css.add(path);}
}
collect(entry);
if(!hasStyle)throw new Error(`${title} stylesheet missing`);
const script = `<script type="module" src="/${entry.file}"></script>`;
const style = [...css].map(path=>`<link rel="stylesheet" href="/${path}">`).join('\n');
const terminal = html.replace('<html lang="en">', `<html lang="en" data-${flag}="true">`)
  .replace('<head>', `<head>\n${script}`)
  .replace('</head>', `${style}\n</head>`)
  .replace(/<title>(.*?)<\/title>/, `<title>${title} · $1</title>`)
  .replace('aria-label="CartoLite live map"', `aria-label="CartoLite ${title} live map"`)
  .replace(/(rel="canonical" href="https:\/\/[^"/]+)\//, `$1/${directory}/`)
  .replace(/(property="og:url" content="https:\/\/[^"/]+)\//, `$1/${directory}/`);
await mkdir(`dist/${directory}`, { recursive: true });
await writeFile(`dist/${directory}/index.html`, terminal);
}
// This manifest is build input, not a new public endpoint.
await unlink('dist/.vite/manifest.json');
await rmdir('dist/.vite');
