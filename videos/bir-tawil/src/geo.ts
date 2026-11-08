// La carte du monde du style « géographie » : frontières Natural Earth (world-atlas, 1:50 m), projection de Mercator.
// Les tracés des pays sont calculés une fois, en coordonnées « monde » ; la caméra n'est qu'une transformation SVG.
import {geoArea, geoGraticule10, geoMercator, geoPath} from 'd3-geo';
import type {Feature, FeatureCollection, MultiPolygon, Polygon} from 'geojson';
import {feature} from 'topojson-client';
import type {Topology} from 'topojson-specification';
import monde from 'world-atlas/countries-50m.json';
import type {LonLat, Vue} from './langues/types';

export const ECHELLE = 1000; // le monde fait 2π·1000 unités de large
export const projection = geoMercator().scale(ECHELLE).translate([0, 0]).precision(0.2);
const chemin = geoPath(projection);

type Props = {name: string};
const topo = monde as unknown as Topology;
const tous = (feature(topo, topo.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon, Props>).features;

/** Le plus grand morceau d'un pays (pour cadrer la France sans la Guyane, la Russie sans l'autre côté du 180e méridien) */
const principal = (f: Feature<Polygon | MultiPolygon, Props>): Feature<Polygon> => {
  if (f.geometry.type === 'Polygon') return f as Feature<Polygon, Props>;
  const parts = f.geometry.coordinates.map((c): Feature<Polygon> => ({type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: c}}));
  return parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
};

export type Pays = {id: string; nom: string; d: string; bornes: [[number, number], [number, number]]; centre: [number, number]};
export const PAYS: Pays[] = tous
  .filter((f) => String(f.id) !== '010') // Antarctique : immense en Mercator, inutile ici
  .map((f) => {
    const p = principal(f);
    return {id: String(f.id), nom: f.properties.name, d: chemin(f) ?? '', bornes: chemin.bounds(p), centre: chemin.centroid(p)};
  });
export const GRATICULE = chemin(geoGraticule10()) ?? '';
/** Toutes les terres en un seul tracé (une seule forme à dessiner par image) */
export const TERRES = PAYS.map((p) => p.d).join(' ');

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS: Record<string, string> = {
  usa: 'United States of America',
  unitedstates: 'United States of America',
  etatsunis: 'United States of America',
  uk: 'United Kingdom',
  royaumeuni: 'United Kingdom',
  russie: 'Russia',
  chine: 'China',
  allemagne: 'Germany',
  suisse: 'Switzerland',
  espagne: 'Spain',
  italie: 'Italy',
  drc: 'Dem. Rep. Congo',
  southkorea: 'South Korea',
  northkorea: 'North Korea',
};
const INDEX = new Map(PAYS.map((p) => [norm(p.nom), p]));
/** Un pays par son nom anglais Natural Earth (« France », « United States of America »), un alias, ou son code ISO numérique */
export const trouverPays = (cle: string): Pays => {
  const p = INDEX.get(norm(ALIAS[norm(cle)] ?? cle)) ?? PAYS.find((x) => x.id === cle.padStart(3, '0'));
  if (!p) throw new Error(`Pays inconnu sur la carte : « ${cle} » (noms : node scripts/pays.mjs)`);
  return p;
};

export const versMonde = (ll: LonLat): [number, number] => projection(ll) as [number, number];

/** Un kilomètre en unités « monde » à une latitude donnée (Mercator) */
export const kmEnMonde = (lat: number) => ECHELLE / 6371 / Math.cos((lat * Math.PI) / 180);

// ——— Caméra ———
export const ECRAN = {w: 1080, h: 1920, cx: 540, cy: 760, zoneW: 940, zoneH: 980}; // la carte se lit au-dessus des sous-titres
export type Camera = {x: number; y: number; k: number}; // centre (monde) et échelle (pixels par unité monde)

export const cameraDe = (v: Vue): Camera => {
  if ('pays' in v) {
    const bs = v.pays.map((n) => trouverPays(n).bornes);
    const x0 = Math.min(...bs.map((b) => b[0][0]));
    const y0 = Math.min(...bs.map((b) => b[0][1]));
    const x1 = Math.max(...bs.map((b) => b[1][0]));
    const y1 = Math.max(...bs.map((b) => b[1][1]));
    const marge = v.marge ?? 1.35;
    const k = Math.min(ECRAN.zoneW / ((x1 - x0) * marge), ECRAN.zoneH / ((y1 - y0) * marge), 400);
    return {x: (x0 + x1) / 2, y: (y0 + y1) / 2, k};
  }
  const [x, y] = versMonde(v.centre);
  return {x, y, k: (v.zoom * ECRAN.w) / (2 * Math.PI * ECHELLE)};
};

const lisse = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Vol entre deux cadrages : centre en ligne droite, zoom en logarithme, avec un recul au milieu si on va loin */
export const voler = (a: Camera, b: Camera, t: number): Camera => {
  const e = lisse(Math.max(0, Math.min(1, t)));
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const kMin = Math.min(a.k, b.k);
  const recul = Math.min(0.75, (dist * kMin) / 2400);
  const lk = Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * e;
  const k = Math.exp(lk) * (1 - recul * Math.sin(Math.PI * e));
  return {x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, k};
};

export const versEcran = (c: Camera, p: [number, number]): [number, number] => [ECRAN.cx + (p[0] - c.x) * c.k, ECRAN.cy + (p[1] - c.y) * c.k];
