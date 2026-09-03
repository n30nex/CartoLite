import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const partitionPath = resolve(root, 'web/src/assets/meshcore-canada-region-partition.geojson')
const registryPath = resolve(root, 'web/src/assets/meshcore-canada-regions.json')
const docsPath = resolve(root, 'docs/data-sources.md')
const expectedVersion = '2026-07-18-mcc-reg-1.1-proposed'
const expectedCount = 193

const [partitionBytes, registryBytes, docs] = await Promise.all([
  readFile(partitionPath),
  readFile(registryPath),
  readFile(docsPath, 'utf8'),
])
const partition = JSON.parse(partitionBytes)
const registry = JSON.parse(registryBytes)
const partitionDigest = createHash('sha256').update(partitionBytes).digest('hex')
const registryDigest = createHash('sha256').update(registryBytes).digest('hex')
const partitionTags = partition.features?.map((feature) => feature?.properties?.tag).sort() ?? []
const seedTags = registry.seeds?.filter((seed) => seed?.resolve === true).map((seed) => seed.tag).sort() ?? []

if (partition.type !== 'FeatureCollection' || partitionTags.length !== expectedCount) {
  throw new Error('MeshCore Canada partition shape or feature count is invalid')
}
if (registry.version !== expectedVersion || seedTags.length !== expectedCount) {
  throw new Error('MeshCore Canada registry version or seed count is invalid')
}
if (new Set(partitionTags).size !== expectedCount || JSON.stringify(partitionTags) !== JSON.stringify(seedTags)) {
  throw new Error('MeshCore Canada partition and registry tag sets differ')
}
for (const feature of partition.features) {
  const geometry = feature?.geometry
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
    throw new Error(`MeshCore Canada region ${feature?.properties?.tag ?? 'unknown'} has invalid geometry`)
  }
}
for (const digest of [partitionDigest, registryDigest]) {
  if (!docs.includes(`SHA-256 \`${digest}\``)) {
    throw new Error(`docs/data-sources.md does not contain committed SHA-256 ${digest}`)
  }
}

console.log(`Verified ${expectedCount} MeshCore Canada regions, ${expectedVersion}`)
console.log(`Partition SHA-256 ${partitionDigest}`)
console.log(`Registry SHA-256 ${registryDigest}`)
