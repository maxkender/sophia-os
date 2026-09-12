#!/usr/bin/env node
/**
 * Quelles fonctions Edge redéployer après un diff ?
 *
 * Une fonction embarque tout `_shared/` qu'elle importe, transitivement : changer
 * `_shared/tierlist.ts` périme 9 fonctions, et une fonction restée sur l'ancien
 * bundle garde l'ancien comportement sans rien signaler. Ce script part des
 * fichiers modifiés et remonte aux points d'entrée concernés.
 *
 * Usage :
 *   node scripts/fonctions-touchees.mjs <fichier modifié> [...]
 *   git diff --name-only HEAD~1 | xargs node scripts/fonctions-touchees.mjs
 *
 * Sans argument : liste toutes les fonctions déployables.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, relative, join } from "node:path";

const RACINE = resolve(process.cwd(), "supabase/functions");

/**
 * Déployées à part : leur code vit dans un `bundle.gz` chargé au boot depuis
 * GitHub (voir `boot.ts` et `scripts/build-*-bundle.sh`). Un `functions deploy`
 * générique n'y changerait rien — il faut reconstruire le bundle et republier
 * le loader avec le nouveau SHA.
 */
const HORS_DEPLOY_GENERIQUE = new Set(["manage-users", "papier-cm"]);

const importsDe = (fichier) => {
  const src = readFileSync(fichier, "utf8");
  const out = new Set();
  for (const m of src.matchAll(/from\s+"(\.[^"]+\.ts)"/g)) {
    out.add(resolve(dirname(fichier), m[1]));
  }
  return out;
};

const fermeture = (entree) => {
  const vus = new Set();
  const pile = [entree];
  while (pile.length > 0) {
    const f = pile.pop();
    if (vus.has(f) || !existsSync(f)) continue;
    vus.add(f);
    for (const i of importsDe(f)) pile.push(i);
  }
  return vus;
};

const fonctions = readdirSync(RACINE, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => e.name)
  .filter((nom) => existsSync(join(RACINE, nom, "index.ts")))
  .filter((nom) => !HORS_DEPLOY_GENERIQUE.has(nom));

const modifies = process.argv.slice(2).map((f) => resolve(process.cwd(), f));

const touchees = fonctions.filter((nom) => {
  if (modifies.length === 0) return true;
  const closure = fermeture(join(RACINE, nom, "index.ts"));
  return modifies.some((m) => closure.has(m));
});

if (process.env.DETAIL === "1") {
  for (const nom of touchees) {
    const closure = [...fermeture(join(RACINE, nom, "index.ts"))]
      .filter((f) => modifies.includes(f))
      .map((f) => relative(RACINE, f));
    console.error(`  ${nom} ← ${closure.join(", ") || "(tout)"}`);
  }
}

console.log(touchees.join(" "));
