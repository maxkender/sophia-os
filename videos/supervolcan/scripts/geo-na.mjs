// Génère src/geo-na.json : l'Amérique du Nord projetée pour un cadre 1080x1920, Yellowstone repéré.
import {readFileSync, writeFileSync} from 'node:fs';
import {feature} from 'topojson-client';
import {geoMercator, geoPath, geoBounds} from 'd3-geo';

const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)));
const pays = feature(topo, topo.objects.countries).features;
const proj = geoMercator().center([-100, 43]).scale(980).translate([540, 960]).clipExtent([[-900, -900], [1980, 2820]]);
const path = geoPath(proj);
const garde = pays.filter((f) => {
  const [[w, s], [e, n]] = geoBounds(f);
  if (f.properties.name === 'Russia') return false;
  // les pays à cheval sur l'antiméridien (États-Unis avec les Aléoutiennes) ont w > e
  if (w > e) return n > 5 && s < 85 && e > -175;
  return e > -175 && w < -45 && n > 5 && s < 85;
});
const pt = (lon, lat) => proj([lon, lat]).map((v) => Math.round(v));
const out = {
  pays: garde.map((f) => ({nom: f.properties.name, d: path(f)})).filter((p) => p.d),
  yellowstone: pt(-110.6, 44.4),
  villes: {chicago: pt(-87.6, 41.9), newYork: pt(-74, 40.7), losAngeles: pt(-118.2, 34.1), denver: pt(-105, 39.7), atlanta: pt(-84.4, 33.7)},
};
writeFileSync(new URL('../src/geo-na.json', import.meta.url), JSON.stringify(out));
console.log(out.pays.length, 'pays ; Yellowstone', out.yellowstone, out.villes);
