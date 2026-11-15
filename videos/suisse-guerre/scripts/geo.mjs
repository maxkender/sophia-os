// Génère src/geo.json : pays d'Europe projetés pour un cadre 1080x1920, plus la Suisse seule en grand.
import {readFileSync, writeFileSync} from 'node:fs';
import {feature} from 'topojson-client';
import {geoMercator, geoPath, geoBounds} from 'd3-geo';

const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)));
const countries = feature(topo, topo.objects.countries).features;

const proj = geoMercator().center([8.2, 46.8]).scale(2300).translate([540, 960]).clipExtent([[-700, -700], [1780, 2620]]);
const path = geoPath(proj);
path.digits?.(1);

const keep = countries.filter((f) => {
  const [[w, s], [e, n]] = geoBounds(f);
  if (e - w > 180) return false; // Russie etc. qui traverse l'antiméridien
  return e > -25 && w < 45 && n > 30 && s < 72;
});

const europe = keep.map((f) => ({id: f.id, name: f.properties.name, d: path(f)})).filter((c) => c.d);
const ch = countries.find((f) => f.properties.name === 'Switzerland');
// La Russie traverse l'antiméridien : on la garde mais découpée par la projection
const russia = countries.find((f) => f.properties.name === 'Russia');
const ru = path(russia);

const chProj = geoMercator().fitExtent([[90, 560], [990, 1360]], ch);
const chPath = geoPath(chProj);
const geneva = chProj([6.14, 46.2]);

const pt = (lon, lat) => proj([lon, lat]).map((v) => Math.round(v));
const out = {
  europe: [...europe, {id: 'RU', name: 'Russia', d: ru}],
  chOnMap: path(ch),
  chCenter: pt(8.2, 46.8),
  chBig: chPath(ch),
  geneva: geneva.map((v) => Math.round(v)),
  hot: {
    France: pt(2.5, 47), Germany: pt(10, 51), Italy: pt(12.5, 42.8), Austria: pt(14.5, 47.6),
    Poland: pt(19.5, 52), Spain: pt(-3.7, 40.2), UK: pt(-1.6, 52.6), Balkans: pt(20.5, 44),
    Belgium: pt(4.6, 50.6), Czech: pt(15.5, 49.8), Hungary: pt(19, 47.2), Denmark: pt(9.5, 56),
  },
  // villes en guerre juste autour de la Suisse (2e vague, quand on zoome)
  near: [pt(4.85, 45.76), pt(7.75, 48.58), pt(9.19, 45.46), pt(11.4, 47.27), pt(11.58, 48.14), pt(7.68, 45.07), pt(6.02, 47.24), pt(9.18, 48.78)],
};
writeFileSync(new URL('../src/geo.json', import.meta.url), JSON.stringify(out));
console.log(europe.length, 'pays', 'CH', out.chCenter, 'Genève', out.geneva, 'taille', JSON.stringify(out).length);
