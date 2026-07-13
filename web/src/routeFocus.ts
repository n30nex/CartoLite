import type { RouteV1 } from './types';

export const NEIGHBOR_ROUTE_RECENT_MS = 24 * 60 * 60_000;

export function recentNeighborRoutes(
  routes: readonly RouteV1[],
  selectedNodeID: string | null,
  now = Date.now()
): RouteV1[] {
  if (!selectedNodeID) return [];
  return routes.filter((route) => (
    (route.from.id === selectedNodeID || route.to.id === selectedNodeID) && isRecentNeighborRoute(route, now)
  ));
}

export function isRecentNeighborRoute(route: Pick<RouteV1, 'lastHeard'>, now: number): boolean {
  return route.lastHeard > 0 && Math.max(0, now - route.lastHeard) <= NEIGHBOR_ROUTE_RECENT_MS;
}
