// Généré par scripts/langues.mjs : ne pas modifier à la main.
import type {DonneesLangue, ScriptLangue, Voix} from './types';
import deScript from './de/script.json';
import deRecit from './de/voix-recit.json';
import deOutro from './de/voix-outro.json';
import enScript from './en/script.json';
import enRecit from './en/voix-recit.json';
import enOutro from './en/voix-outro.json';
import frScript from './fr/script.json';
import frRecit from './fr/voix-recit.json';
import frOutro from './fr/voix-outro.json';
import itScript from './it/script.json';
import itRecit from './it/voix-recit.json';
import itOutro from './it/voix-outro.json';

export const LANGUES: Record<string, DonneesLangue> = {
  'de': {code: 'de', script: deScript as unknown as ScriptLangue, recit: deRecit as Voix, outro: deOutro as Voix},
  'en': {code: 'en', script: enScript as unknown as ScriptLangue, recit: enRecit as Voix, outro: enOutro as Voix},
  'fr': {code: 'fr', script: frScript as unknown as ScriptLangue, recit: frRecit as Voix, outro: frOutro as Voix},
  'it': {code: 'it', script: itScript as unknown as ScriptLangue, recit: itRecit as Voix, outro: itOutro as Voix},
};
