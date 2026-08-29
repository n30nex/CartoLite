import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const assetPath = resolve(root, 'web/src/assets/meshmapper-canada-regions.geojson')
const docsPath = resolve(root, 'docs/data-sources.md')
const expectedCodes = [
  'XCM', 'XPH', 'YBL', 'YCD', 'YEG', 'YGK', 'YKA', 'YKF', 'YLK', 'YML', 'YOW', 'YPA',
  'YQA', 'YQB', 'YQF', 'YQL', 'YQQ', 'YQT', 'YQY', 'YSE', 'YTA', 'YTF', 'YTR', 'YUL',
  'YVR', 'YWG', 'YWS', 'YXU', 'YXX', 'YYB', 'YYC', 'YYJ', 'YYY', 'YYZ',
]

const bytes = await readFile(assetPath)
const docs = await readFile(docsPath, 'utf8')
const snapshot = JSON.parse(bytes)
const codes = snapshot.features.map((feature) => feature?.properties?.code).sort()
const digest = createHash('sha256').update(bytes).digest('hex')

if (snapshot.type !== 'FeatureCollection' || snapshot.metadata?.regionCount !== expectedCodes.length) {
  throw new Error('MeshMapper snapshot metadata is invalid')
}
if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) {
  throw new Error('MeshMapper snapshot region codes changed')
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.metadata?.retrievedAt ?? '')) {
  throw new Error('MeshMapper retrieval date is invalid')
}
if (snapshot.metadata?.geometry !== 'unsimplified') {
  throw new Error('MeshMapper snapshot is not marked unsimplified')
}
if (!docs.includes(`SHA-256 \`${digest}\``)) {
  throw new Error(`docs/data-sources.md does not contain the committed region SHA-256 ${digest}`)
}

console.log(`Verified ${codes.length} MeshMapper regions, ${snapshot.metadata.retrievedAt}, SHA-256 ${digest}`)
