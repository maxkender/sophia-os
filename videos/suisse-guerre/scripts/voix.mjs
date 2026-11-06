// Génère la voix off (ElevenLabs, avec horodatage par caractère) : récit + phrase de fin.
// La clé est injectée par le proxy de l'environnement (en-tête xi-api-key) ; ELEVENLABS_API_KEY sinon.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';

const racine = new URL('..', import.meta.url);
const script = JSON.parse(readFileSync(new URL('src/script.json', racine)));
const CLE = process.env.ELEVENLABS_API_KEY || 'proxy-injected';
const forcer = process.argv.includes('--forcer');

const tts = async (texte, nom) => {
  const mp3 = new URL(`public/audio/${nom}.mp3`, racine);
  const json = new URL(`src/voix-${nom}.json`, racine);
  if (!forcer && existsSync(mp3) && existsSync(json)) return console.log(`${nom} : déjà là`);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${script.voix.id}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {'xi-api-key': CLE, 'Content-Type': 'application/json'},
      body: JSON.stringify({text: texte, model_id: script.voix.modele, voice_settings: script.voix.reglages}),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
  const a = j.alignment;
  writeFileSync(
    json,
    JSON.stringify({texte, caracteres: a.characters, debuts: a.character_start_times_seconds, fins: a.character_end_times_seconds}),
  );
  console.log(`${nom} : ${a.characters.length} caractères, ${a.character_end_times_seconds.at(-1).toFixed(2)} s`);
};

await tts(script.scenes.map((s) => s.texte).join(' '), 'recit');
await tts(script.outro.texte, 'outro');
