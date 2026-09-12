import type { Map as MapLibreMap } from 'maplibre-gl';
import { recolorPaint } from './displayPreferences';

/** Keep the original expressions, including semantic feature colors, through every theme switch. */
export function applyOverlayPalette(map: MapLibreMap, originals: Map<string, unknown>, light: boolean): void {
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('basemap-') || !('paint' in layer)) continue;
    for (const property of Object.keys(layer.paint ?? {})) {
      if (!property.endsWith('-color')) continue;
      const key = `${layer.id}:${property}`;
      if (!originals.has(key)) originals.set(key, map.getPaintProperty(layer.id, property));
      map.setPaintProperty(layer.id, property, recolorPaint(originals.get(key), light));
    }
  }
}
