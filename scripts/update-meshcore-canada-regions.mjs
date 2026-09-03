import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sources = [
  {
    label: 'partition',
    url: 'https://meshcore.ca/assets/regions/canada-region-partition.geojson',
    output: '../web/src/assets/meshcore-canada-region-partition.geojson',
  },
  {
    label: 'registry',
    url: 'https://meshcore.ca/assets/regions/canada-regions.json',
    output: '../web/src/assets/meshcore-canada-regions.json',
  },
]
const expectedVersion = '2026-07-18-mcc-reg-1.1-proposed'
const expectedCount = 193
const scriptDirectory = dirname(fileURLToPath(import.meta.url))

const downloaded = new Map()
for (const source of sources) {
  const response = await fetch(source.url, {
    headers: { accept: 'application/json', 'user-agent': 'CartoLite region snapshot updater' },
  })
  if (!response.ok) throw new Error(`${source.label} returned HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  downloaded.set(source.label, { ...source, bytes, value: JSON.parse(new TextDecoder().decode(bytes)) })
}

const partition = downloaded.get('partition').value
const registry = downloaded.get('registry').value
const partitionTags = partition.features?.map((feature) => feature?.properties?.tag).sort() ?? []
const seedTags = registry.seeds?.filter((seed) => seed?.resolve === true).map((seed) => seed.tag).sort() ?? []
if (partition.type !== 'FeatureCollection' || partitionTags.length !== expectedCount) {
  throw new Error('partition shape or feature count changed')
}
if (registry.version !== expectedVersion || seedTags.length !== expectedCount) {
  throw new Error('registry version or resolving seed count changed')
}
if (new Set(partitionTags).size !== expectedCount || JSON.stringify(partitionTags) !== JSON.stringify(seedTags)) {
  throw new Error('partition and registry tag sets differ')
}

for (const source of sources) {
  const item = downloaded.get(source.label)
  const outputPath = resolve(scriptDirectory, source.output)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, item.bytes)
  console.log(`Wrote ${item.bytes.byteLength} bytes to ${outputPath}`)
}
