import type { FeatureCollection, Point, Polygon } from 'geojson';

export interface FlightPose { lng: number; lat: number; altitude: number; bearing: number; pitch: number }
export interface FlightInput { forward: number; right: number; up: number }
const RAD = Math.PI / 180;
const METRES = 6378137 * RAD;
export const FLIGHT_CLEARANCE = 12;

export function offsetPosition(lng: number, lat: number, east: number, north: number): [number, number] {
  return [lng + east / (METRES * Math.cos(lat * RAD)), lat + north / METRES];
}

export function flightDirection(pose: Pick<FlightPose, 'bearing' | 'pitch'>): [number, number, number] {
  const bearing = pose.bearing * RAD, pitch = pose.pitch * RAD;
  return [Math.sin(bearing) * Math.sin(pitch), Math.cos(bearing) * Math.sin(pitch), -Math.cos(pitch)];
}

/** Camera motion is elapsed-time based; a resumed/blocked tab never catches up. */
export function moveFlight(pose: FlightPose, input: FlightInput, seconds: number, speed: number): FlightPose {
  const f = flightDirection(pose), yaw = pose.bearing * RAD;
  const east = f[0] * input.forward + Math.cos(yaw) * input.right;
  const north = f[1] * input.forward - Math.sin(yaw) * input.right;
  const up = f[2] * input.forward + input.up;
  const step = Math.max(0, Math.min(.05, seconds)) * Math.max(0, Math.min(1500, speed)) / Math.max(1, Math.hypot(east, north, up));
  const [lng, lat] = offsetPosition(pose.lng, pose.lat, east * step, north * step);
  return { ...pose, lng: Math.max(-142, Math.min(-48, lng)), lat: Math.max(38, Math.min(84, lat)),
    altitude: Math.max(FLIGHT_CLEARANCE, Math.min(12000, pose.altitude + up * step)) };
}

export function flightDepth(pose: FlightPose, coordinates: [number, number], elevation: number): number {
  const f = flightDirection(pose);
  const east = (coordinates[0] - pose.lng) * METRES * Math.cos(pose.lat * RAD);
  const latitude=Math.max(-85.051129,Math.min(85.051129,coordinates[1]));
  const mercator=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*RAD/2));
  const north = (mercator(latitude)-mercator(pose.lat))*6378137*Math.cos(pose.lat*RAD);
  const up = elevation*Math.cos(pose.lat*RAD)/Math.cos(latitude*RAD)-pose.altitude;
  return east * f[0] + north * f[1] + up * f[2];
}

/** These are visual location markers, not measured antenna heights. */
export function flightBeacons(nodes: FeatureCollection<Point>): FeatureCollection<Polygon> {
  return { type: 'FeatureCollection', features: nodes.features.map(node => {
    const [lng = 0, lat = 0] = node.geometry.coordinates;
    const ring = Array.from({ length: 6 }, (_, i) => offsetPosition(lng, lat, Math.cos(i * Math.PI / 3) * 9, Math.sin(i * Math.PI / 3) * 9));
    ring.push(ring[0]!);
    return { type: 'Feature', id: node.id, properties: { id: node.properties?.id ?? node.id, role: node.properties?.role, label: node.properties?.label },
      geometry: { type: 'Polygon', coordinates: [ring] } };
  }) };
}
