// Génère la voix off d'une langue (ElevenLabs, avec horodatage par caractère) : récit + phrase de fin.
// Usage : node scripts/voix.mjs --langue fr [--forcer]
// Pas de « : » dans le texte dit (pause forcée) ; les blancs sont resserrés automatiquement (scripts/resserrer.mjs).
// La clé est injectée par le proxy de l'environnement (en-tête xi-api-key) ; ELEVENLABS_API_KEY sinon.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resserrer} from './resserrer.mjs';

const arg = (nom, defaut) => {
  const i = process.argv.indexOf(`--${nom}`);
  return i > 0 ? process.argv[i + 1] : defaut;
};
const langue = arg('langue', 'en');
const forcer = process.argv.includes('--forcer');
const racine = new URL('..', import.meta.url);
const script = JSON.parse(readFileSync(new URL(`src/langues/${langue}/script.json`, racine)));
const CLE = process.env.ELEVENLABS_API_KEY || 'proxy-injected';
mkdirSync(new URL(`public/audio/${langue}/`, racine), {recursive: true});

const tts = async (texte, nom) => {
  const mp3 = new URL(`public/audio/${langue}/${nom}.mp3`, racine);
  const json = new URL(`src/langues/${langue}/voix-${nom}.json`, racine);
  if (!forcer && existsSync(mp3) && existsSync(json) && JSON.parse(readFileSync(json)).texte === texte) {
    return console.log(`${langue}/${nom} : déjà à jour`);
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${script.voix.id}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {'xi-api-key': CLE, 'Content-Type': 'application/json'},
      body: JSON.stringify({text: texte, model_id: script.voix.modele, voice_settings: script.voix.reglages, language_code: langue}),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
  const a = j.alignment;
  writeFileSync(json, JSON.stringify({texte, caracteres: a.characters, debuts: a.character_start_times_seconds, fins: a.character_end_times_seconds}));
  // les blancs trop longs (ponctuation, fins de phrase) sont raccourcis, horodatages recalés
  const r = resserrer(new URL(mp3).pathname, new URL(json).pathname);
  const duree = a.character_end_times_seconds.at(-1) - r.coupe;
  console.log(`${langue}/${nom} : ${a.characters.length} caractères, ${duree.toFixed(2)} s (${r.n} blancs resserrés, ${r.coupe.toFixed(1)} s gagnées)`);
};

await tts(script.scenes.map((s) => s.texte).join(' '), 'recit');
await tts(script.outro.texte, 'outro');
