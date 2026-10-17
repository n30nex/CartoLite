import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = process.argv[2] ?? "web/dist";
// Report artifact sizes without release-blocking caps. Runtime gates remain.

async function assets(dir, pattern) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await assets(path, pattern));
    else if (pattern.test(entry.name)) found.push(path);
  }
  return found;
}

const files = await assets(root, /\.(?:css|m?js)$/);
if (files.length === 0) throw new Error(`no JavaScript or CSS assets found in ${root}`);

let total = 0;
let terminalBytes = 0;
let workerBytes = 0;
let workerCount = 0;
for (const file of files) {
  const bytes = gzipSync(await readFile(file), { level: 9 }).byteLength;
  total += bytes;
  if (/^terminal-.*\.(?:m?js|css)$/.test(basename(file))) terminalBytes += bytes;
  if (/^maplibre-gl-worker-.*\.m?js$/.test(basename(file))) {
    workerBytes += bytes;
    workerCount += 1;
  }
  console.log(`${bytes.toString().padStart(8)}  ${file}`);
}

console.log(`${total} gzip bytes total`);
console.log(`${total - workerBytes - terminalBytes} gzip bytes for main UI`);
console.log(`${workerBytes} gzip bytes for map worker`);
console.log(terminalBytes + ' gzip bytes for optional Terminal');
if (terminalBytes <= 0) throw new Error('missing optional Terminal assets');
if (workerCount !== 1) throw new Error(`expected one map worker, found ${workerCount}`);

const partitionFiles = await assets(root, /^meshcore-canada-region-partition.*\.geojson$/);
if (partitionFiles.length !== 1) {
  throw new Error(`expected one built MeshCore Canada region partition in ${root}, found ${partitionFiles.length}`);
}
const partitionBytes = gzipSync(await readFile(partitionFiles[0]), { level: 9 }).byteLength;
console.log(`${partitionBytes} gzip bytes for ${partitionFiles[0]}`);

const registryFiles = await assets(root, /^meshcore-canada-regions.*\.json$/);
if (registryFiles.length !== 1) {
  throw new Error(`expected one built MeshCore Canada region registry in ${root}, found ${registryFiles.length}`);
}
const registryBytes = gzipSync(await readFile(registryFiles[0]), { level: 9 }).byteLength;
console.log(`${registryBytes} gzip bytes for ${registryFiles[0]}`);
