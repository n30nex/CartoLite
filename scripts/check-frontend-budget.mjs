import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2] ?? "web/dist";
const limit = Number(process.env.CARTOLITE_GZIP_BUDGET ?? 354 * 1024);
const partitionLimit = Number(process.env.CARTOLITE_REGION_GZIP_BUDGET ?? 3_200 * 1024);
const registryLimit = Number(process.env.CARTOLITE_REGION_REGISTRY_GZIP_BUDGET ?? 24 * 1024);

async function assets(dir, pattern) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await assets(path, pattern));
    else if (pattern.test(entry.name)) found.push(path);
  }
  return found;
}

const files = await assets(root, /\.(?:css|js)$/);
if (files.length === 0) throw new Error(`no JavaScript or CSS assets found in ${root}`);

let total = 0;
for (const file of files) {
  const bytes = gzipSync(await readFile(file), { level: 9 }).byteLength;
  total += bytes;
  console.log(`${bytes.toString().padStart(8)}  ${file}`);
}

console.log(`${total} gzip bytes total (budget ${limit})`);
if (total > limit) process.exitCode = 1;

const partitionFiles = await assets(root, /^meshcore-canada-region-partition.*\.geojson$/);
if (partitionFiles.length !== 1) {
  throw new Error(`expected one built MeshCore Canada region partition in ${root}, found ${partitionFiles.length}`);
}
const partitionBytes = gzipSync(await readFile(partitionFiles[0]), { level: 9 }).byteLength;
console.log(`${partitionBytes} gzip bytes for ${partitionFiles[0]} (budget ${partitionLimit})`);
if (partitionBytes > partitionLimit) process.exitCode = 1;

const registryFiles = await assets(root, /^meshcore-canada-regions.*\.json$/);
if (registryFiles.length !== 1) {
  throw new Error(`expected one built MeshCore Canada region registry in ${root}, found ${registryFiles.length}`);
}
const registryBytes = gzipSync(await readFile(registryFiles[0]), { level: 9 }).byteLength;
console.log(`${registryBytes} gzip bytes for ${registryFiles[0]} (budget ${registryLimit})`);
if (registryBytes > registryLimit) process.exitCode = 1;
