// Planche de contrôle : quelques images fixes de la vidéo, assemblées en mosaïque.
// Usage : node scripts/planche.mjs <sortie.jpg> <image> <image> ... [--langue en] [--colonnes 6] [--echelle 0.3] [--sous-titres]
// Affiche aussi le temps de rendu de chaque image (à --echelle 1, c'est le coût réel d'une image du rendu).
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const sousTitres = args.includes('--sous-titres');
if (sousTitres) args.splice(args.indexOf('--sous-titres'), 1);
const langue = opt('langue', 'en');
const cols = Number(opt('colonnes', '6'));
const echelle = Number(opt('echelle', '0.3'));
const [sortie, ...images] = args;
const racine = path.resolve(new URL('..', import.meta.url).pathname);
const {composition: id} = JSON.parse(readFileSync(path.join(racine, 'motion.json'), 'utf8'));
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const serveUrl = await bundle({entryPoint: path.join(racine, 'src/index.ts')});
const inputProps = {langue, sousTitres};
const composition = await selectComposition({serveUrl, id, inputProps, browserExecutable});
const dir = mkdtempSync(path.join(tmpdir(), 'planche-'));
const fichiers = [];
for (const fr of images.map(Number)) {
  const output = path.join(dir, `${String(fr).padStart(5, '0')}.png`);
  const t0 = Date.now();
  await renderStill({serveUrl, composition, frame: fr, output, inputProps, scale: echelle, browserExecutable});
  console.log(`image ${fr} : ${Date.now() - t0} ms`);
  fichiers.push(output);
}
const ins = fichiers.flatMap((f) => ['-i', f]);
const lignes = Math.ceil(fichiers.length / cols);
const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...ins, '-filter_complex', `${fichiers.map((_, i) => `[${i}]scale=324:576,drawtext=text='${images[i]}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6[t${i}]`).join(';')};${fichiers.map((_, i) => `[t${i}]`).join('')}xstack=inputs=${fichiers.length}:layout=${fichiers.map((_, i) => `${(i % cols) * 324}_${Math.floor(i / cols) * 576}`).join('|')}:fill=black`, '-frames:v', '1', sortie]);
if (r.status !== 0) throw new Error(String(r.stderr));
console.log(sortie, `${fichiers.length} images, ${lignes} lignes`);
