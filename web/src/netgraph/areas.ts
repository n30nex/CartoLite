export interface NetgraphAreaAnchor {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

// Lightweight visual anchors combine the bundled MeshMapper region centres
// with nearby metros represented in the public topology. They segment the
// graph without adding a geocoder, API field, or runtime GeoJSON parse.
export const NETGRAPH_AREA_ANCHORS: readonly NetgraphAreaAnchor[] = [
  { code: 'AST', name: 'Astoria', lat: 46.1879, lng: -123.8313 },
  { code: 'BLI', name: 'Bellingham', lat: 48.7519, lng: -122.4787 },
  { code: 'BUF', name: 'Buffalo', lat: 42.8864, lng: -78.8784 },
  { code: 'EAT', name: 'Wenatchee', lat: 47.4235, lng: -120.3103 },
  { code: 'EUG', name: 'Eugene', lat: 44.0521, lng: -123.0868 },
  { code: 'GEG', name: 'Spokane', lat: 47.6588, lng: -117.426 },
  { code: 'MFR', name: 'Medford', lat: 42.3265, lng: -122.8756 },
  { code: 'OLM', name: 'Olympia', lat: 47.0379, lng: -122.9007 },
  { code: 'PDX', name: 'Portland', lat: 45.5152, lng: -122.6784 },
  { code: 'PSC', name: 'Tri-Cities', lat: 46.2396, lng: -119.1006 },
  { code: 'ROC', name: 'Rochester', lat: 43.1566, lng: -77.6088 },
  { code: 'SEA', name: 'Seattle', lat: 47.6062, lng: -122.3321 },
  { code: 'SLE', name: 'Salem', lat: 44.9429, lng: -123.0351 },
  { code: 'SYR', name: 'Syracuse', lat: 43.0481, lng: -76.1474 },
  { code: 'XCM', name: 'Chatham-Kent', lat: 42.406519, lng: -82.188273 },
  { code: 'XPH', name: 'Port Hope', lat: 43.972045, lng: -78.209874 },
  { code: 'YBL', name: 'Campbell River', lat: 49.99008, lng: -125.26207 },
  { code: 'YCD', name: 'Nanaimo', lat: 49.164167, lng: -123.936389 },
  { code: 'YCM', name: 'St. Catharines', lat: 43.1594, lng: -79.2469 },
  { code: 'YEG', name: 'Edmonton', lat: 53.551268, lng: -113.491265 },
  { code: 'YGK', name: 'Kingston', lat: 44.582323, lng: -76.589399 },
  { code: 'YHM', name: 'Hamilton', lat: 43.2557, lng: -79.8711 },
  { code: 'YKA', name: 'Kamloops', lat: 50.686535, lng: -120.349611 },
  { code: 'YKF', name: 'Waterloo', lat: 43.343679, lng: -80.670063 },
  { code: 'YLK', name: 'Barrie', lat: 44.329265, lng: -80.186228 },
  { code: 'YLW', name: 'Kelowna', lat: 49.888, lng: -119.496 },
  { code: 'YML', name: 'La Malbaie', lat: 47.73137, lng: -70.240941 },
  { code: 'YOO', name: 'Oshawa', lat: 43.8971, lng: -78.8658 },
  { code: 'YOW', name: 'Ottawa–Gatineau', lat: 45.414367, lng: -75.678441 },
  { code: 'YPA', name: 'Prince Albert', lat: 53.204373, lng: -105.761435 },
  { code: 'YQA', name: 'Muskoka', lat: 45.54754, lng: -79.069812 },
  { code: 'YQB', name: 'Quebec City', lat: 46.894912, lng: -71.406054 },
  { code: 'YQF', name: 'Red Deer', lat: 52.278035, lng: -113.813442 },
  { code: 'YQG', name: 'Windsor', lat: 42.3149, lng: -83.0364 },
  { code: 'YQL', name: 'Lethbridge', lat: 49.684963, lng: -112.834123 },
  { code: 'YQQ', name: 'Courtenay', lat: 49.671948, lng: -125.016697 },
  { code: 'YQT', name: 'Thunder Bay', lat: 49.478633, lng: -88.448439 },
  { code: 'YQY', name: 'Cape Breton Island', lat: 46.064667, lng: -60.728121 },
  { code: 'YSE', name: 'Squamish', lat: 49.697058, lng: -123.152517 },
  { code: 'YTA', name: 'Pembroke', lat: 45.69912, lng: -77.050993 },
  { code: 'YTF', name: 'Saguenay Lac-st-jean', lat: 48.503553, lng: -71.618181 },
  { code: 'YTR', name: 'Quinte West', lat: 44.157979, lng: -77.368694 },
  { code: 'YUL', name: 'Montreal', lat: 45.506474, lng: -73.583082 },
  { code: 'YVR', name: 'Vancouver', lat: 49.28173, lng: -123.11928 },
  { code: 'YWG', name: 'Winnipeg', lat: 49.896517, lng: -97.130584 },
  { code: 'YWS', name: 'Whistler', lat: 50.317004, lng: -122.789747 },
  { code: 'YXS', name: 'Prince George', lat: 53.9171, lng: -122.7497 },
  { code: 'YXU', name: 'London', lat: 42.992904, lng: -81.241093 },
  { code: 'YXX', name: 'Abbotsford', lat: 49.023309, lng: -122.368297 },
  { code: 'YYB', name: 'North Bay', lat: 46.3091, lng: -79.4608 },
  { code: 'YYC', name: 'Calgary', lat: 51.016738, lng: -114.001493 },
  { code: 'YYJ', name: 'Victoria', lat: 48.43719, lng: -123.361624 },
  { code: 'YYY', name: 'Bas-St-Laurent-Gaspésie', lat: 48.609293, lng: -68.206893 },
  { code: 'YYZ', name: 'Toronto', lat: 43.791241, lng: -79.301717 },
] as const;

export function nearestNetgraphArea(lat: number, lng: number): NetgraphAreaAnchor {
  let nearest = NETGRAPH_AREA_ANCHORS[0]!;
  let nearestDistance = Infinity;
  for (const area of NETGRAPH_AREA_ANCHORS) {
    const meanLatitude = (lat + area.lat) * Math.PI / 360;
    const longitudeDistance = (lng - area.lng) * Math.cos(meanLatitude);
    const latitudeDistance = lat - area.lat;
    const distance = longitudeDistance * longitudeDistance + latitudeDistance * latitudeDistance;
    if (distance < nearestDistance || (distance === nearestDistance && area.code < nearest.code)) {
      nearest = area;
      nearestDistance = distance;
    }
  }
  return nearest;
}
