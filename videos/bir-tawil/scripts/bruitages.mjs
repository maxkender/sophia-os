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
  // Supervolcan
  eruption: ['Massive volcanic eruption blast, deep explosive roar with rumbling rocks', 3.0],
  roar: ['Pyroclastic flow rushing, huge rolling roar of hot ash cloud and wind', 4.0],
  car: ['Car speeding past, engine revving and whoosh', 1.5],
  crack: ['Wooden roof cracking and collapsing under heavy weight, creak and crash', 1.5],
  magma: ['Thick lava bubbling and gurgling deep underground', 3.0],
  breath: ['Deep slow giant breathing rumble, sleeping monster', 2.5],
  geyser: ['Geyser erupting, powerful steam hiss and water spray', 2.0],
  jet: ['Jet airliner flying overhead, engine roar passing by', 2.5],
  thunder: ['Sharp thunder crack with electric zap', 1.2],
  blizzard: ['Cold blizzard wind howling with snow', 5.0],
  freeze: ['Ice crystals forming and crackling, frost spreading', 1.2],
  tick: ['Stopwatch ticking fast, mechanical clock ticks', 1.0],
  pageFlip: ['Calendar pages flipping fast, paper flutter', 1.0],
  birds: ['Cheerful birds chirping in a sunny forest', 3.0],
  waves: ['Gentle sea waves on a sunny beach', 3.0],
  swirl: ['Cartoon dizzy swirl whirl sound, wobbly spin', 1.0],
  powerDown: ['Sunlight dimming, soft descending synth power down', 1.2],
  // Moyen Âge (ambiances douces, bruitages légers)
  countryside: ['Calm medieval countryside ambience, soft wind over fields, distant birds, very gentle', 8.0],
  fireplace: ['Quiet indoor wood fire crackling softly, calm cottage ambience', 8.0],
  rain: ['Steady soft rain falling on fields, calm and gentle', 8.0],
  town: ['Medieval town street ambience, distant chatter, cart wheels, soft and far away', 8.0],
  night: ['Quiet night ambience, crickets and soft wind', 8.0],
  hall: ['Large stone castle hall room tone, soft echo, very quiet', 8.0],
  winter: ['Soft cold winter wind, quiet and lonely', 8.0],
  bell: ['Single distant church bell toll, soft and warm with long decay', 3.0],
  chime: ['Very soft gentle wooden chime, warm and calm', 1.5],
  pageSoft: ['Soft slow paper page turning, gentle rustle', 1.2],
  cloth: ['Soft fabric rustle, gentle cloth movement', 1.0],
  hooves: ['Horse walking slowly on dirt, a few calm hoof steps', 2.0],
  // Moyen Âge, version drôle (bruitages cartoon)
  boing: ['Cartoon spring boing, bouncy and funny', 0.8],
  slideUp: ['Cartoon slide whistle going up quickly', 0.8],
  slideDown: ['Cartoon slide whistle going down, disappointed', 1.0],
  bonk: ['Cartoon bonk on the head, hollow wooden knock with tiny birds tweeting', 1.0],
  gulp: ['Cartoon nervous gulp swallow sound', 0.6],
  sadTrombone: ['Sad trombone wah wah wah waaah, comedic fail', 2.0],
  scratch: ['Vinyl record scratch, comedic stop', 0.7],
  squeak: ['Cartoon rubber squeak, short and funny', 0.5],
  plop: ['Cartoon plop, something soft dropping', 0.5],
  runFeet: ['Cartoon fast running footsteps scurrying away', 1.2],
  snore: ['Cartoon loud snore with a whistle on the exhale', 2.0],
  oink: ['Pig oinking, funny short grunts', 1.0],
  moo: ['Cow mooing, funny and loud', 1.5],
  splash: ['Bucket of water splashing on the ground, wet splat', 1.0],
  kazoo: ['Short goofy kazoo fanfare, celebratory', 1.5],
  tada: ['Cartoon ta-da fanfare, short and triumphant', 1.2],
  clangFunny: ['Metal armor falling over with a comedic clatter', 1.2],
  whistleFall: ['Cartoon falling whistle, descending pitch before a crash', 1.5],
  crashFunny: ['Cartoon crash into the ground, comedic thud with debris', 1.0],
  stomach: ['Loud cartoon stomach growl, hungry rumble', 1.5],
  sneaky: ['Sneaky cartoon pizzicato strings, villain tiptoeing', 2.0],
  hammer: ['Small hammer tapping on leather and wood, three quick taps', 1.0],
  squeakRats: ['Several mice squeaking and scurrying', 1.5],
  sneeze: ['Horse snorting and sneezing, comedic', 1.0],
  cough: ['Old man coughing, comedic but not gross', 1.2],
  bubbles: ['Water bubbles and soapy scrubbing sounds, playful', 1.5],
  ding: ['Bright cartoon ding, idea or approval', 0.6],
  pop2: ['Cartoon pop as a character appears, bubbly', 0.5],
  gasp: ['Cartoon gasp of surprise, short', 0.6],
  flies: ['Cartoon flies buzzing around something smelly', 2.0],
  // Géographie, rendu réaliste : sons discrets de documentaire (rien de cartoon)
  swooshDoux: ['Very subtle soft air swoosh, smooth cinematic camera move, quiet and clean, no whistle', 1.2],
  ticDoux: ['Very soft minimal UI tick, clean and subtle, documentary infographic', 0.5],
  basseDouce: ['Soft deep cinematic low thump, subtle sub bass hit, clean, documentary', 1.0],
  traitDoux: ['Soft smooth digital line drawing sound, subtle airy sweep, minimal', 1.2],
  nappe: ['Calm modern documentary background music bed, soft ambient synth pad with a gentle pulse, no drums, no melody peaks, seamless', 30.0],
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
