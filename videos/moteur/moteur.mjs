#!/usr/bin/env node
// Moteur Motion : le lien entre la page Motion de l'OS (fonction Edge `motion`) et les projets Remotion de videos/.
// Lancer avec : NODE_USE_ENV_PROXY=1 node videos/moteur/moteur.mjs <commande> [--options]
//
//   prendre                                         prend la prochaine tâche (script / produire / corriger) et l'affiche
//   script   --tache T --video V --fichier F [--projet P]   envoie le script écrit (JSON) → la page le montre à valider
//   voix     --projet P --langue L [--forcer]       génère la voix ElevenLabs horodatée de la langue
//   rendre   --projet P --langue L [--sans-sous-titres]   rend la vidéo avec sous-titres (+ sans, sur demande), son à -14 LUFS
//   livrer   --video V --projet P --langue L        envoie la vidéo (+ la version sans sous-titres si rendue) → « à valider »
//   en-cours --video V --langue L                   marque une langue en cours de production
//   journal  --video V --message "…"                ajoute une ligne au journal de la vidéo
//   finir    --tache T [--resultat '{…}']           tâche faite
//   echec    --tache T --erreur "…"                 tâche en échec (re-tentée jusqu'à 3 fois)
//
// Le jeton du moteur vient de l'environnement (MOTION_JETON), jamais d'un fichier.
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, renameSync, rmSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const VIDEOS = resolve(ICI, '..');
const URL_OS = process.env.SUPABASE_URL ?? 'https://mbikecieskoobeizixig.supabase.co';
const TAILLE_MAX = 48e6; // octets : au-delà, la vidéo est recompressée avant l'envoi
const CHROME = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';

const [, , commande, ...reste] = process.argv;
const opt = (nom) => {
  const i = reste.indexOf(`--${nom}`);
  return i >= 0 ? reste[i + 1] : undefined;
};
const requis = (nom) => {
  const v = opt(nom);
  if (!v) throw new Error(`--${nom} manquant`);
  return v;
};

async function appel(action, corps = {}) {
  const jeton = process.env.MOTION_JETON;
  if (!jeton) throw new Error("MOTION_JETON manquant : le générer dans la page Motion (Réglages) et l'ajouter à l'environnement");
  const r = await fetch(`${URL_OS}/functions/v1/motion`, {
    method: 'POST',
    headers: {'content-type': 'application/json', 'x-motion-jeton': jeton},
    body: JSON.stringify({action, ...corps}),
  });
  const json = await r.json().catch(() => ({ok: false, error: `HTTP ${r.status}`}));
  if (!r.ok || json.ok === false) throw new Error(`${action} : ${json.error ?? `HTTP ${r.status}`}`);
  return json;
}

const projetDir = (p) => {
  const d = join(VIDEOS, p);
  if (!existsSync(join(d, 'package.json'))) throw new Error(`projet introuvable : videos/${p}`);
  return d;
};
const lancer = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, {cwd, stdio: 'inherit', env: {...process.env, NODE_USE_ENV_PROXY: '1'}});
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} : code ${r.status}`);
};
const duree = (f) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], {encoding: 'utf8'});
  return Number(r.stdout.trim()) || null;
};

async function envoyer(video, langue, fichier, nom) {
  const u = await appel('upload_url', {video_id: video, langue, nom});
  const url = u.url_upload ?? u.upload_url;
  const r = await fetch(url, {method: 'PUT', headers: {'content-type': 'video/mp4', 'x-upsert': 'true'}, body: readFileSync(fichier)});
  if (!r.ok) throw new Error(`envoi ${nom} : HTTP ${r.status} ${await r.text()}`);
  console.log(`envoyé : ${nom} (${(statSync(fichier).size / 1e6).toFixed(1)} Mo)`);
  return u.chemin;
}

const commandes = {
  async prendre() {
    const r = await appel('prendre');
    console.log(JSON.stringify(r, null, 2));
  },
  async script() {
    const script = JSON.parse(readFileSync(requis('fichier'), 'utf8'));
    await appel('script_pret', {tache_id: requis('tache'), video_id: requis('video'), script, projet: opt('projet')});
    console.log('script envoyé : à valider dans la page Motion');
  },
  async voix() {
    const args = ['scripts/voix.mjs', '--langue', requis('langue')];
    if (reste.includes('--forcer')) args.push('--forcer');
    lancer('node', args, projetDir(requis('projet')));
  },
  async rendre() {
    const dir = projetDir(requis('projet'));
    const langue = requis('langue');
    const {composition} = JSON.parse(readFileSync(join(dir, 'motion.json'), 'utf8'));
    lancer('node', ['scripts/langues.mjs'], dir);
    const navigateur = existsSync(CHROME) ? [`--browser-executable=${CHROME}`] : [];
    // Par défaut, seulement la version postée (avec sous-titres) ; --sans-sous-titres rend aussi l'autre.
    const versions = [[true, 'final']];
    const sans = join(dir, `out/${langue}/final-sans-sous-titres.mp4`);
    if (reste.includes('--sans-sous-titres')) versions.push([false, 'final-sans-sous-titres']);
    else if (existsSync(sans)) rmSync(sans); // jamais livrer une ancienne version sans sous-titres
    for (const [sousTitres, nom] of versions) {
      const brut = `out/${langue}/${nom}-brut.mp4`;
      lancer(
        'npx',
        ['remotion', 'render', composition, brut, `--props=${JSON.stringify({langue, sousTitres})}`, '--codec=h264', '--crf=22', '--concurrency=4', ...navigateur],
        dir,
      );
      lancer(
        'ffmpeg',
        ['-loglevel', 'error', '-y', '-i', brut, '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `out/${langue}/${nom}.mp4`],
        dir,
      );
      // Le stockage refuse les gros fichiers (une vidéo de 140 Mo est passée en 413) : au-delà de 48 Mo,
      // on réencode en x264 lent crf 28 (sans perte visible sur le papier découpé, ~40 Mo pour 3 min 30).
      const fichier = join(dir, `out/${langue}/${nom}.mp4`);
      if (statSync(fichier).size > TAILLE_MAX) {
        const compact = `out/${langue}/${nom}-compact.mp4`;
        lancer('ffmpeg', ['-loglevel', 'error', '-y', '-i', `out/${langue}/${nom}.mp4`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', compact], dir);
        renameSync(join(dir, compact), fichier);
        console.log(`${nom}.mp4 recompressé : ${(statSync(fichier).size / 1e6).toFixed(1)} Mo`);
      }
    }
    console.log(`rendu : videos/${requis('projet')}/out/${langue}/final.mp4${versions.length > 1 ? ' (+ final-sans-sous-titres.mp4)' : ''}`);
  },
  async livrer() {
    const video = requis('video');
    const langue = requis('langue');
    const dir = projetDir(requis('projet'));
    const final = join(dir, `out/${langue}/final.mp4`);
    const sans = join(dir, `out/${langue}/final-sans-sous-titres.mp4`);
    if (!existsSync(final)) throw new Error('rendre la langue avant de la livrer');
    const script = JSON.parse(readFileSync(join(dir, `src/langues/${langue}/script.json`), 'utf8'));
    const video_chemin = await envoyer(video, langue, final, `video-${Date.now()}.mp4`);
    // la version sans sous-titres n'est livrée que si elle a été rendue (rendre --sans-sous-titres)
    const video_brute_chemin = existsSync(sans) ? await envoyer(video, langue, sans, `video-sans-sous-titres-${Date.now()}.mp4`) : null;
    await appel('langue_prete', {video_id: video, langue, script, legende: script.legende ?? null, video_chemin, video_brute_chemin, duree_s: duree(final)});
    console.log(`${langue} livrée : à valider dans la page Motion`);
  },
  async 'en-cours'() {
    await appel('langue_en_cours', {video_id: requis('video'), langue: requis('langue')});
  },
  async journal() {
    await appel('journal', {video_id: requis('video'), message: requis('message')});
  },
  async finir() {
    const resultat = opt('resultat');
    await appel('finir', {tache_id: requis('tache'), resultat: resultat ? JSON.parse(resultat) : null});
  },
  async echec() {
    await appel('echec', {tache_id: requis('tache'), erreur: requis('erreur')});
  },
};

if (!commandes[commande]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 16).join('\n'));
  process.exit(commande ? 1 : 0);
}
try {
  await commandes[commande]();
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
