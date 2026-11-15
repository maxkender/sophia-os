// Génère la banque de bruitages (ElevenLabs Sound Effects). Chaque son n'est généré qu'une fois.
import {existsSync, writeFileSync} from 'node:fs';

const CLE = process.env.ELEVENLABS_API_KEY || 'proxy-injected';
export const BRUITAGES = {
  tear: ['Paper sheet ripped in half quickly, crisp tearing sound', 1.0],
  whoosh: ['Fast swoosh whoosh transition, air swipe', 0.7],
  pop: ['Small cartoon paper pop, light bubbly pop', 0.5],
  boom: ['Big cinematic explosion, deep bass boom with rocks and debris', 2.5],
  boomSmall: ['Short distant cartoon explosion, muffled boom', 1.0],
  warAmb: ['Distant war ambience, far away artillery rumbles and explosions', 4.0],
  rumble: ['Deep earth rumble as huge mountains rise from the ground, rocky grinding swell', 1.8],
  wind: ['Strong alpine wind howling on a snowy mountain peak', 5.0],
  tankCrash: ['Metal tank tumbling down a rocky slope, clanking crash', 1.5],
  flag: ['Flag cloth flapping in the wind, quick flutter', 1.0],
  unroll: ['Old parchment scroll unrolling fast, paper rustle', 1.0],
  scribble: ['Quill pen scribbling quickly on parchment paper', 1.5],
  stamp: ['Heavy wax seal stamp slammed on a wooden table, deep thud', 0.8],
  thud: ['Wooden object dropped on grass, soft heavy thud', 0.6],
  door: ['Small wooden door creaking open quickly', 0.8],
  march: ['Group of soldiers stomping boots in unison, two beats', 1.2],
  rifle: ['Rifle placed on metal hooks, mechanical metallic clack', 0.7],
  train: ['Electric train passing by fast on rails, whoosh and rail clatter', 2.5],
  fold: ['Big sheet of cardboard paper folding down, flap', 0.8],
  fuse: ['Burning fuse sizzling and crackling', 2.0],
  clang: ['Metal tank bumping into rocks, dull metallic clang', 0.8],
  cannon: ['Old cannon firing a single shot, short boom with echo', 1.2],
  coins: ['Gold coins clinking and dropping onto a pile', 1.2],
  coin: ['Single gold coin landing with a metallic clink', 0.5],
  doves: ['Doves flapping their wings and taking off', 1.2],
  pin: ['Map pin dropping with a soft pop', 0.5],
  clap: ['Firm handshake, warm whoosh and soft impact', 0.8],
  scale: ['Brass balance scale tipping over with a metallic clunk', 1.0],
  sparkle: ['Magical shimmering sparkle chime', 1.0],
  click: ['Smartphone screen tap, crisp UI click', 0.5],
  correct: ['Mobile game correct answer chime, bright positive ding', 0.8],
  confetti: ['Party popper confetti burst with a short happy cheer', 1.5],
  phone: ['Smartphone sliding onto a table with a whoosh', 0.8],
};

const generer = async ([nom, [texte, duree]]) => {
  const fichier = new URL(`../public/sfx/${nom}.mp3`, import.meta.url);
  if (existsSync(fichier)) return `${nom} (déjà là)`;
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: {'xi-api-key': CLE, 'Content-Type': 'application/json'},
    body: JSON.stringify({text: texte, duration_seconds: duree, prompt_influence: 0.6}),
  });
  if (!res.ok) throw new Error(`${nom} : ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
  writeFileSync(fichier, Buffer.from(await res.arrayBuffer()));
  return nom;
};

const liste = Object.entries(BRUITAGES);
for (let i = 0; i < liste.length; i += 4) {
  console.log((await Promise.all(liste.slice(i, i + 4).map(generer))).join(', '));
}
