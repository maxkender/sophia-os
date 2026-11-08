// Liste les noms de pays utilisables dans le champ `carte` du script (noms anglais Natural Earth, world-atlas 1:50 m).
// Usage : node scripts/pays.mjs [filtre]
import {readFileSync} from 'node:fs';
const monde = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)));
const filtre = (process.argv[2] ?? '').toLowerCase();
const noms = monde.objects.countries.geometries.map((g) => `${g.properties.name} (${g.id})`).filter((n) => n.toLowerCase().includes(filtre)).sort();
console.log(noms.join('\n'));
