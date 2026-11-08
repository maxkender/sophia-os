// Resserre les blancs d'une voix off horodatée : les pauses trop longues (entre deux phrases, sur une virgule,
// au milieu d'une phrase) sont raccourcies, et les horodatages sont recalés d'autant.
// Usage : node scripts/resserrer.mjs --langue fr   (ou import { resserrer } pour le faire juste après la voix)
import {spawnSync} from 'node:child_process';
import {readFileSync, renameSync, writeFileSync} from 'node:fs';

// Blanc gardé selon ce qui précède la pause (secondes). On ne coupe jamais entre deux mots d'une même phrase :
// ça hachait la voix. Chaque coupe a un petit fondu pour ne pas claquer.
const GARDE = {phrase: 0.34, virgule: 0.22, mot: Infinity};
const MARGE = 0.06; // on ne coupe pas pour moins que ça
const FONDU = 0.015;

const garde = (mot) => (/[.?!…]$/.test(mot) ? GARDE.phrase : /[,;:—]$/.test(mot) ? GARDE.virgule : GARDE.mot);

export function resserrer(mp3, json) {
  const v = JSON.parse(readFileSync(json, 'utf8'));
  const t = v.texte;
  // mots : [début du mot, fin du mot, index du 1er et du dernier caractère]
  const mots = [];
  for (let i = 0; i < t.length; ) {
    if (/\s/.test(t[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < t.length && !/\s/.test(t[j])) j++;
    mots.push({texte: t.slice(i, j), debut: v.debuts[i], fin: v.fins[j - 1], i, j});
    i = j;
  }
  // coupes : [de, a] en secondes, au milieu de chaque blanc trop long
  const coupes = [];
  for (let k = 0; k < mots.length - 1; k++) {
    const blanc = mots[k + 1].debut - mots[k].fin;
    const g = garde(mots[k].texte);
    if (blanc > g + MARGE) {
      const milieu = (mots[k].fin + mots[k + 1].debut) / 2;
      coupes.push([milieu - (blanc - g) / 2, milieu + (blanc - g) / 2, k]);
    }
  }
  if (coupes.length === 0) return {coupe: 0, n: 0};
  // segments gardés
  const segs = [];
  let de = 0;
  for (const [a, b] of coupes) {
    segs.push([de, a]);
    de = b;
  }
  segs.push([de, null]);
  const filtres = segs
    .map(([a, b], n) => {
      const fin = b === null ? '' : `,afade=t=out:st=${Math.max(0, b - a - FONDU).toFixed(3)}:d=${FONDU}`;
      const debut = n === 0 ? '' : `,afade=t=in:st=0:d=${FONDU}`;
      return `[0]atrim=start=${a.toFixed(3)}${b === null ? '' : `:end=${b.toFixed(3)}`},asetpts=PTS-STARTPTS${debut}${fin}[s${n}]`;
    })
    .join(';');
  const concat = `${segs.map((_, n) => `[s${n}]`).join('')}concat=n=${segs.length}:v=0:a=1[out]`;
  const tmp = mp3.replace(/\.mp3$/, '.resserre.mp3');
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp3, '-filter_complex', `${filtres};${concat}`, '-map', '[out]', '-b:a', '160k', tmp]);
  if (r.status !== 0) throw new Error(`ffmpeg : ${r.stderr}`);
  renameSync(tmp, mp3);
  // horodatages recalés : chaque caractère recule de la somme des coupes qui le précèdent
  const decalage = (s) => coupes.reduce((acc, [a, b]) => (s >= b ? acc + (b - a) : acc), 0);
  v.debuts = v.debuts.map((s) => +(s - decalage(s)).toFixed(3));
  v.fins = v.fins.map((s) => +(s - decalage(s)).toFixed(3));
  writeFileSync(json, JSON.stringify(v));
  return {coupe: coupes.reduce((acc, [a, b]) => acc + (b - a), 0), n: coupes.length};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--langue');
  const langue = i > 0 ? process.argv[i + 1] : 'en';
  const racine = new URL('..', import.meta.url);
  for (const nom of ['recit', 'outro']) {
    const r = resserrer(new URL(`public/audio/${langue}/${nom}.mp3`, racine).pathname, new URL(`src/langues/${langue}/voix-${nom}.json`, racine).pathname);
    console.log(`${langue}/${nom} : ${r.n} blancs resserrés, ${r.coupe.toFixed(2)} s gagnées`);
  }
}
