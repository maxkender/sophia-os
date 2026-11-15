// Écrit src/langues/index.ts avec les langues complètes (script + voix du récit + voix de fin).
import {existsSync, readdirSync, writeFileSync} from 'node:fs';

const dir = new URL('../src/langues/', import.meta.url);
const FICHIERS = ['script.json', 'voix-recit.json', 'voix-outro.json'];
const codes = readdirSync(dir, {withFileTypes: true})
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((c) => FICHIERS.every((f) => existsSync(new URL(`${c}/${f}`, dir))))
  .sort();
const id = (c) => c.replace(/[^a-z0-9]/gi, '_');
let out = "// Généré par scripts/langues.mjs : ne pas modifier à la main.\nimport type {DonneesLangue, ScriptLangue, Voix} from './types';\n";
for (const c of codes) {
  out += `import ${id(c)}Script from './${c}/script.json';\nimport ${id(c)}Recit from './${c}/voix-recit.json';\nimport ${id(c)}Outro from './${c}/voix-outro.json';\n`;
}
out += '\nexport const LANGUES: Record<string, DonneesLangue> = {\n';
out += codes
  .map((c) => `  '${c}': {code: '${c}', script: ${id(c)}Script as unknown as ScriptLangue, recit: ${id(c)}Recit as Voix, outro: ${id(c)}Outro as Voix},`)
  .join('\n');
out += '\n};\n';
writeFileSync(new URL('index.ts', dir), out);
console.log('langues :', codes.join(', ') || '(aucune)');
