export interface SavedView {
  center: [number, number];
  zoom: number;
}

export type ViewClass = 'desktop' | 'mobile';

const VIEW_STORAGE_PREFIX = 'cartolite:view:v3';

export function viewClass(
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): ViewClass {
  return Math.min(viewportWidth, viewportHeight) <= 620 ? 'mobile' : 'desktop';
}

export function viewStorageKey(kind: ViewClass): string {
  return `${VIEW_STORAGE_PREFIX}:${kind}`;
}

export function loadSavedView(storage: Storage, kind: ViewClass): SavedView | null {
  try {
    const value = JSON.parse(storage.getItem(viewStorageKey(kind)) ?? 'null') as {
      center?: unknown;
      zoom?: unknown;
    } | null;
    if (!value || !Array.isArray(value.center) || value.center.length !== 2 || typeof value.zoom !== 'number') return null;
    const lng = Number(value.center[0]);
    const lat = Number(value.center[1]);
    const zoom = Number(value.zoom);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)
      || lng < -142 || lng > -48 || lat < 38 || lat > 84 || zoom < 3 || zoom > 16) return null;
    return { center: [lng, lat], zoom };
  } catch {
    return null;
  }
}

export function saveView(storage: Storage, kind: ViewClass, view: SavedView): void {
  try {
    storage.setItem(viewStorageKey(kind), JSON.stringify(view));
  } catch {
    // Local persistence is optional; private browsing may reject it.
  }
}
