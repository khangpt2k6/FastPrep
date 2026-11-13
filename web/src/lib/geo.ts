// Places, for the Jobs page's location and distance filters, with no service asked: US states, and the cities postings
// name most, with their rough coordinates (a tenth of a degree is plenty for "within 50 miles").

export const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(STATES).map(([code, name]) => [name.toLowerCase(), code]));

// [city, state, latitude, longitude]
const CITIES: [string, string, number, number][] = [
  ['Tampa', 'FL', 27.95, -82.46], ['St. Petersburg', 'FL', 27.77, -82.64], ['Saint Petersburg', 'FL', 27.77, -82.64],
  ['Clearwater', 'FL', 27.97, -82.8], ['Brandon', 'FL', 27.94, -82.29], ['Lakeland', 'FL', 28.04, -81.95], ['Sarasota', 'FL', 27.34, -82.53],
  ['Bradenton', 'FL', 27.5, -82.57], ['Largo', 'FL', 27.91, -82.79], ['Wesley Chapel', 'FL', 28.24, -82.33], ['Orlando', 'FL', 28.54, -81.38],
  ['Miami', 'FL', 25.76, -80.19], ['Fort Lauderdale', 'FL', 26.12, -80.14], ['Boca Raton', 'FL', 26.37, -80.13],
  ['West Palm Beach', 'FL', 26.71, -80.05], ['Jacksonville', 'FL', 30.33, -81.66], ['Tallahassee', 'FL', 30.44, -84.28],
  ['Gainesville', 'FL', 29.65, -82.32], ['Melbourne', 'FL', 28.08, -80.61], ['Fort Myers', 'FL', 26.64, -81.87], ['Pensacola', 'FL', 30.42, -87.22],
  ['Atlanta', 'GA', 33.75, -84.39], ['Alpharetta', 'GA', 34.08, -84.29], ['Charlotte', 'NC', 35.23, -80.84], ['Raleigh', 'NC', 35.78, -78.64],
  ['Durham', 'NC', 35.99, -78.9], ['Research Triangle Park', 'NC', 35.9, -78.86], ['RTP', 'NC', 35.9, -78.86], ['Nashville', 'TN', 36.16, -86.78],
  ['Birmingham', 'AL', 33.52, -86.8], ['Huntsville', 'AL', 34.73, -86.59], ['Charleston', 'SC', 32.78, -79.93], ['Columbia', 'SC', 34.0, -81.03],
  ['New York', 'NY', 40.71, -74.01], ['Brooklyn', 'NY', 40.68, -73.94], ['Jersey City', 'NJ', 40.73, -74.08], ['Newark', 'NJ', 40.74, -74.17],
  ['Princeton', 'NJ', 40.36, -74.66], ['Boston', 'MA', 42.36, -71.06], ['Cambridge', 'MA', 42.37, -71.11], ['Waltham', 'MA', 42.38, -71.24],
  ['Burlington', 'MA', 42.5, -71.2], ['Philadelphia', 'PA', 39.95, -75.17], ['Pittsburgh', 'PA', 40.44, -80.0], ['Washington', 'DC', 38.9, -77.04],
  ['Arlington', 'VA', 38.88, -77.1], ['McLean', 'VA', 38.93, -77.18], ['Reston', 'VA', 38.96, -77.36], ['Herndon', 'VA', 38.97, -77.39],
  ['Chantilly', 'VA', 38.89, -77.43], ['Richmond', 'VA', 37.54, -77.44], ['Baltimore', 'MD', 39.29, -76.61], ['Bethesda', 'MD', 38.98, -77.1],
  ['Rockville', 'MD', 39.08, -77.15], ['Columbia', 'MD', 39.2, -76.86], ['Annapolis Junction', 'MD', 39.12, -76.78], ['Stamford', 'CT', 41.05, -73.54],
  ['Hartford', 'CT', 41.76, -72.68], ['Providence', 'RI', 41.82, -71.41], ['Chicago', 'IL', 41.88, -87.63], ['Detroit', 'MI', 42.33, -83.05],
  ['Ann Arbor', 'MI', 42.28, -83.74], ['Columbus', 'OH', 39.96, -83.0], ['Cleveland', 'OH', 41.5, -81.69], ['Cincinnati', 'OH', 39.1, -84.51],
  ['Indianapolis', 'IN', 39.77, -86.16], ['Milwaukee', 'WI', 43.04, -87.91], ['Madison', 'WI', 43.07, -89.4], ['Minneapolis', 'MN', 44.98, -93.27],
  ['St. Louis', 'MO', 38.63, -90.2], ['Kansas City', 'MO', 39.1, -94.58], ['Omaha', 'NE', 41.26, -95.93], ['Des Moines', 'IA', 41.59, -93.62],
  ['Dallas', 'TX', 32.78, -96.8], ['Plano', 'TX', 33.02, -96.7], ['Irving', 'TX', 32.81, -96.95], ['Fort Worth', 'TX', 32.76, -97.33],
  ['Austin', 'TX', 30.27, -97.74], ['Houston', 'TX', 29.76, -95.37], ['San Antonio', 'TX', 29.42, -98.49], ['Denver', 'CO', 39.74, -104.99],
  ['Boulder', 'CO', 40.01, -105.27], ['Colorado Springs', 'CO', 38.83, -104.82], ['Salt Lake City', 'UT', 40.76, -111.89], ['Lehi', 'UT', 40.39, -111.85],
  ['Phoenix', 'AZ', 33.45, -112.07], ['Tempe', 'AZ', 33.43, -111.94], ['Scottsdale', 'AZ', 33.49, -111.93], ['Las Vegas', 'NV', 36.17, -115.14],
  ['Albuquerque', 'NM', 35.08, -106.65], ['Seattle', 'WA', 47.61, -122.33], ['Bellevue', 'WA', 47.61, -122.2], ['Redmond', 'WA', 47.67, -122.12],
  ['Kirkland', 'WA', 47.68, -122.21], ['Portland', 'OR', 45.52, -122.68], ['Hillsboro', 'OR', 45.52, -122.99], ['San Francisco', 'CA', 37.77, -122.42],
  ['Oakland', 'CA', 37.8, -122.27], ['Emeryville', 'CA', 37.83, -122.29], ['San Jose', 'CA', 37.34, -121.89], ['Santa Clara', 'CA', 37.35, -121.96],
  ['Sunnyvale', 'CA', 37.37, -122.04], ['Mountain View', 'CA', 37.39, -122.08], ['Palo Alto', 'CA', 37.44, -122.14], ['Menlo Park', 'CA', 37.45, -122.18],
  ['Redwood City', 'CA', 37.49, -122.24], ['San Mateo', 'CA', 37.56, -122.32], ['Cupertino', 'CA', 37.32, -122.03], ['Fremont', 'CA', 37.55, -121.99],
  ['Milpitas', 'CA', 37.43, -121.9], ['Los Angeles', 'CA', 34.05, -118.24], ['Santa Monica', 'CA', 34.02, -118.49], ['Culver City', 'CA', 34.02, -118.4],
  ['Irvine', 'CA', 33.68, -117.83], ['San Diego', 'CA', 32.72, -117.16], ['Sacramento', 'CA', 38.58, -121.49], ['El Segundo', 'CA', 33.92, -118.42],
  ['Hawthorne', 'CA', 33.92, -118.35], ['Honolulu', 'HI', 21.31, -157.86], ['Anchorage', 'AK', 61.22, -149.9],
];

/** The two-letter state a piece of a location names ("FL", "Florida"), or ''. */
export function stateOf(part: string): string {
  for (const piece of part.split(',').map((p) => p.trim()).reverse()) {
    const upper = piece.toUpperCase();
    if (upper.length === 2 && STATES[upper]) return upper;
    const code = BY_NAME[piece.toLowerCase()];
    if (code) return code;
  }
  return '';
}

/** Every state a posting's location names: "Austin, TX; Remote" gives TX. */
export function statesOf(location: string): string[] {
  return [...new Set(location.split(/[;|/]/).map(stateOf).filter(Boolean))];
}

const norm = (text: string) => text.toLowerCase().replace(/\bsaint\b/g, 'st.').replace(/[^a-z.]+/g, ' ').trim();

/** The coordinates of a city by its name and, when known, its state; null when the table does not have it. */
export function cityPoint(city: string, state = ''): [number, number] | null {
  const want = norm(city);
  if (!want) return null;
  const code = state.length === 2 ? state.toUpperCase() : BY_NAME[state.toLowerCase()] ?? '';
  const hit = CITIES.find(([name, st]) => norm(name) === want && (!code || st === code)) ?? (code ? null : CITIES.find(([name]) => norm(name) === want));
  return hit ? [hit[2], hit[3]] : null;
}

/** The places a posting's location names, as coordinates: "San Jose, CA; Austin, TX" gives two. */
export function pointsOf(location: string): [number, number][] {
  const found: [number, number][] = [];
  for (const part of location.split(/[;|/]/)) {
    const pieces = part.split(',').map((p) => p.trim()).filter(Boolean);
    if (!pieces.length) continue;
    const point = cityPoint(pieces[0], stateOf(part));
    if (point) found.push(point);
  }
  return found;
}

/** Miles between two points, on a sphere: close enough for a radius filter. */
export function milesBetween(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** How far the nearest place of a posting is from home, in miles; null when none of its places is in the table. */
export function milesFrom(home: [number, number], location: string): number | null {
  const points = pointsOf(location);
  return points.length ? Math.min(...points.map((point) => milesBetween(home, point))) : null;
}
