// Généré par scripts/langues.mjs : ne pas modifier à la main.
import type {DonneesLangue, ScriptLangue, Voix} from './types';
import enScript from './en/script.json';
import enRecit from './en/voix-recit.json';
import enOutro from './en/voix-outro.json';
import frScript from './fr/script.json';
import frRecit from './fr/voix-recit.json';
import frOutro from './fr/voix-outro.json';

export const LANGUES: Record<string, DonneesLangue> = {
  'en': {code: 'en', script: enScript as unknown as ScriptLangue, recit: enRecit as Voix, outro: enOutro as Voix},
  'fr': {code: 'fr', script: frScript as unknown as ScriptLangue, recit: frRecit as Voix, outro: frOutro as Voix},
};
