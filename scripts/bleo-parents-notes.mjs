#!/usr/bin/env node
// BLEO, lot L1 : relève dans les `notes` des originaux de podz les liens
// parent → variante (« variante de ay-o005 », « reprend l'accroche d'am-o003 »…).
//
// Les notes ne vivent que dans le dépôt : ni le guichet ni la base ne les
// connaissent. Ce script en sort des candidats ; la liste retenue est relue à la
// main (faux parents, parents cités par préfixe d'uuid) et versée dans la
// migration 0601. Il ne touche à rien.
//
//   node scripts/bleo-parents-notes.mjs            # tous les candidats, lisibles
//   node scripts/bleo-parents-notes.mjs --json     # une ligne JSON par candidat
//   node scripts/bleo-parents-notes.mjs --retenus  # les paires gardées après relecture
//   node scripts/bleo-parents-notes.mjs --sql      # ces paires en VALUES pour 0601

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RACINE = new URL("../pods/", import.meta.url).pathname;

// Expressions qui désignent un parent, de la plus sûre à la plus lâche.
const LIENS = [
  { sorte: "variante", motif: /variante\s+(?:de\s+|d['’]\s*)([a-z]{1,4}-o\d{3}|[0-9a-f]{8})/gi },
  { sorte: "reprise", motif: /reprend\s+l['’]\s*accroche\s+(?:de\s+|d['’]\s*)([a-z]{1,4}-o\d{3})/gi },
  { sorte: "reprise", motif: /reprise\s+(?:de\s+|d['’]\s*)([a-z]{1,4}-o\d{3})/gi },
  { sorte: "suite", motif: /suite\s+(?:de\s+|d['’]\s*)([a-z]{1,4}-o\d{3})/gi },
  { sorte: "esprit", motif: /dans\s+l['’]\s*esprit\s+(?:de\s+|d['’]\s*)([a-z]{1,4}-o\d{3})/gi },
];

const candidats = [];
for (const dossier of readdirSync(RACINE).sort()) {
  const rep = join(RACINE, dossier, "originaux");
  if (!existsSync(rep)) continue;
  for (const fichier of readdirSync(rep).filter((f) => f.endsWith(".json")).sort()) {
    const j = JSON.parse(readFileSync(join(rep, fichier), "utf8"));
    const id = j.source_id ?? j.id;
    const notes = String(j.notes ?? "");
    for (const { sorte, motif } of LIENS) {
      for (const m of notes.matchAll(motif)) {
        const debut = Math.max(0, m.index - 60);
        candidats.push({
          dossier,
          enfant: id,
          parent: m[1].toLowerCase(),
          sorte,
          rang: candidats.filter((c) => c.dossier === dossier && c.enfant === id).length + 1,
          extrait: notes.slice(debut, m.index + m[0].length + 20).replace(/\s+/g, " "),
        });
      }
    }
  }
}

// Relecture du 29/10. Une note de lot recopiée dans chaque fichier du jour
// (« seule sg-o026 en reprend une (… variante de sg-o001 …) ») désigne le
// parent d'UN autre fichier, pas celui du fichier qui la porte.
const FAUX_PARENTS = new Set([
  "sg-o025", "sg-o027", "sg-o028", "sg-o029", "sg-o030",
  "sg-o032", "sg-o033", "sg-o034", "sg-o035", "sg-o036",
]);

// Une variante ne garde que son premier parent cité (« variante de ay-o011,
// elle-même variante d'ay-o005 » : le parent est ay-o011). « aucune reprise de »
// est une négation ; « dans l'esprit de » n'est qu'une inspiration.
function retenu(c) {
  if (FAUX_PARENTS.has(c.enfant)) return false;
  if (c.sorte === "esprit") return false;
  if (c.sorte === "reprise" && /aucune\s+reprise/i.test(c.extrait)) return false;
  return true;
}

const POD_DU_DOSSIER = Object.fromEntries(
  readdirSync(RACINE).flatMap((d) => {
    const api = join(RACINE, d, "atelier", "api.ts");
    if (!existsSync(api)) return [];
    const m = readFileSync(api, "utf8").match(/export const POD = "([^"]+)"/);
    return m ? [[d, m[1]]] : [];
  }),
);

function paires() {
  const vues = new Set();
  const out = [];
  for (const c of candidats.filter(retenu)) {
    if (vues.has(c.dossier + c.enfant)) continue;
    vues.add(c.dossier + c.enfant);
    out.push({ pod: POD_DU_DOSSIER[c.dossier], enfant: c.enfant, parent: c.parent });
  }
  return out;
}

if (process.argv.includes("--sql")) {
  const lignes = paires().map((p) => `  ('${p.pod}', '${p.enfant}', '${p.parent}')`);
  console.log(`values\n${lignes.join(",\n")}`);
  console.error(`${lignes.length} paire(s) retenue(s)`);
} else if (process.argv.includes("--retenus")) {
  for (const p of paires()) console.log(`${p.pod}\t${p.enfant} ← ${p.parent}`);
} else if (process.argv.includes("--json")) {
  for (const c of candidats) console.log(JSON.stringify(c));
} else {
  for (const c of candidats) {
    console.log(`${c.dossier}\t${c.enfant}\t#${c.rang}\t${c.sorte}\t${c.parent}\t… ${c.extrait}`);
  }
  console.error(`${candidats.length} candidat(s)`);
}
