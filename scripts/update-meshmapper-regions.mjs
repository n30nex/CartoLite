import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL =
  'https://meshmapper.net/?ajax=zones_bbox&minLat=41&maxLat=84&minLon=-141&maxLon=-52&exclude='

const EXPECTED_CODES = [
  'XCM',
  'XPH',
  'YBL',
  'YCD',
  'YEG',
  'YGK',
  'YKA',
  'YKF',
  'YLK',
  'YML',
  'YOW',
  'YPA',
  'YQA',
  'YQB',
  'YQF',
  'YQL',
  'YQQ',
  'YSE',
  'YTA',
  'YTF',
  'YTR',
  'YUL',
  'YVR',
  'YWG',
  'YWS',
  'YXX',
  'YYC',
  'YYJ',
  'YYZ',
]

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(
  scriptDirectory,
  '../web/src/assets/meshmapper-canada-regions.geojson',
)

function fail(message) {
  throw new Error(`MeshMapper region update failed: ${message}`)
}

function compareCodeSets(label, actualCodes, expectedCodes) {
  const actual = [...actualCodes].sort()
  const expected = [...expectedCodes].sort()

  if (actual.length !== expected.length || actual.some((code, index) => code !== expected[index])) {
    const missing = expected.filter((code) => !actual.includes(code))
    const unexpected = actual.filter((code) => !expected.includes(code))
    fail(
      `${label} codes changed (missing: ${missing.join(', ') || 'none'}; ` +
        `unexpected: ${unexpected.join(', ') || 'none'})`,
    )
  }
}

function parseRing(zone) {
  let leafletRing

  try {
    leafletRing = typeof zone.polygon === 'string' ? JSON.parse(zone.polygon) : zone.polygon
  } catch (error) {
    fail(`${zone.code} polygon is not valid JSON: ${error.message}`)
  }

  if (!Array.isArray(leafletRing) || leafletRing.length < 3) {
    fail(`${zone.code} polygon must contain at least three Leaflet coordinates`)
  }

  const ring = leafletRing.map((coordinate, index) => {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length !== 2 ||
      !Number.isFinite(coordinate[0]) ||
      !Number.isFinite(coordinate[1])
    ) {
      fail(`${zone.code} polygon coordinate ${index} is not a finite [lat, lon] pair`)
    }

    const [latitude, longitude] = coordinate
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      fail(`${zone.code} polygon coordinate ${index} is outside geographic bounds`)
    }

    return [longitude, latitude]
  })

  const first = ring[0]
  const last = ring.at(-1)
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first])
  }

  if (ring.length < 4) {
    fail(`${zone.code} GeoJSON ring must contain at least four coordinates including closure`)
  }

  return ring
}

function validateZone(zone) {
  if (!zone || typeof zone !== 'object') {
    fail('received a non-object zone')
  }
  if (typeof zone.code !== 'string' || !EXPECTED_CODES.includes(zone.code)) {
    fail(`received invalid Canadian region code ${JSON.stringify(zone.code)}`)
  }
  if (typeof zone.name !== 'string' || !zone.name.endsWith(', CA')) {
    fail(`${zone.code} name does not end with ", CA"`)
  }
  if (!Number.isFinite(zone.lat) || zone.lat < -90 || zone.lat > 90) {
    fail(`${zone.code} center latitude is invalid`)
  }
  if (!Number.isFinite(zone.lon) || zone.lon < -180 || zone.lon > 180) {
    fail(`${zone.code} center longitude is invalid`)
  }
  if (!Number.isFinite(zone.radius_km) || zone.radius_km <= 0) {
    fail(`${zone.code} radius_km is invalid`)
  }
}

const retrievedAt = process.env.MESHMAPPER_RETRIEVED_AT ?? new Date().toISOString().slice(0, 10)
if (!/^\d{4}-\d{2}-\d{2}$/.test(retrievedAt)) {
  fail('MESHMAPPER_RETRIEVED_AT must use YYYY-MM-DD format')
}

const response = await fetch(SOURCE_URL, {
  headers: {
    accept: 'application/json',
    'user-agent': 'CartoLite region snapshot updater',
  },
})

if (!response.ok) {
  fail(`HTTP ${response.status} ${response.statusText}`)
}

const zones = await response.json()
if (!Array.isArray(zones)) {
  fail('endpoint response is not an array')
}

const canadianZones = zones.filter(
  (zone) => zone && typeof zone.name === 'string' && zone.name.endsWith(', CA'),
)
compareCodeSets(
  'endpoint Canadian',
  canadianZones.map((zone) => zone.code),
  EXPECTED_CODES,
)

const selectedZones = zones.filter((zone) => EXPECTED_CODES.includes(zone?.code))
compareCodeSets(
  'selected',
  selectedZones.map((zone) => zone.code),
  EXPECTED_CODES,
)

for (const code of EXPECTED_CODES) {
  if (selectedZones.filter((zone) => zone.code === code).length !== 1) {
    fail(`${code} must occur exactly once in the endpoint response`)
  }
}

const features = selectedZones
  .sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0))
  .map((zone) => {
    validateZone(zone)
    return {
      type: 'Feature',
      properties: {
        code: zone.code,
        name: zone.name.slice(0, -4),
        country: 'CA',
        center: [zone.lon, zone.lat],
        radiusKm: zone.radius_km,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [parseRing(zone)],
      },
    }
  })

const featureCollection = {
  type: 'FeatureCollection',
  metadata: {
    source: 'MeshMapper',
    sourceUrl: SOURCE_URL,
    retrievedAt,
    country: 'CA',
    regionCount: features.length,
    geometry: 'unsimplified',
  },
  features,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, JSON.stringify(featureCollection), 'utf8')

const vertexCount = features.reduce(
  (total, feature) => total + feature.geometry.coordinates[0].length,
  0,
)
console.log(`Wrote ${features.length} regions and ${vertexCount} vertices to ${outputPath}`)
