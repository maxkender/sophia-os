// Vérifie que chaque texte de en.json est traduit dans les autres langues de apps/join/src/locales :
// une clé non vide dont la valeur est identique à l'anglais est une clé oubliée, sauf exception listée ici
// (mots identiques dans la langue, noms propres, sigles). Lancer : `npm test` dans apps/join ; aussi vérifié par
// vitest à la racine (src/test/joinTraductions.test.ts).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DOSSIER_LOCALES = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "locales");

/** Clés identiques à l'anglais dans toutes les langues (« * ») ou dans certaines seulement. */
export const EXCEPTIONS = {
  "faq.label": "*", // FAQ
  "foot.faq": "*", // FAQ
  "step.profil.bio": "*", // Bio
  "legal.notice.hostTitle": ["cs", "de", "it", "nl", "pl", "sk", "sr"], // Hosting
  "login.code": ["de", "fr", "nl"], // Code
  "privacy.contact.title": ["fr", "nl", "ro"], // 9. Contact
  "privacy.contact.1": ["fr"], // adresse en France
  "legal.notice.contact": ["nl", "ro"], // Contact: …
  "foot.contract": ["nl", "ro"], // Contract
  "foot.privacy": ["it", "nl"], // Privacy
  "form.email": ["el", "it"], // Email
  "form.no": ["es", "it"], // No
  "dash.optional": ["de"], // Optional
  "step.profil.name": ["de"], // Name
  "step.profil.photo": ["fr"], // Photo
  "pay.short": ["nl"], // ${tarif}/week
  "pay.perWeekUnit": ["nl"], // USD per week
};

/** Les clés non traduites : [{ langue, cle }]. */
export function clesNonTraduites(dossier = DOSSIER_LOCALES) {
  const lire = (f) => JSON.parse(readFileSync(join(dossier, f), "utf8"));
  const en = lire("en.json");
  const manques = [];
  for (const f of readdirSync(dossier).filter((x) => x.endsWith(".json") && x !== "en.json").sort()) {
    const langue = f.slice(0, -5);
    const dico = lire(f);
    for (const [cle, valeur] of Object.entries(en)) {
      if (!valeur || dico[cle] !== valeur) continue;
      const ex = EXCEPTIONS[cle];
      if (ex === "*" || (Array.isArray(ex) && ex.includes(langue))) continue;
      manques.push({ langue, cle });
    }
  }
  return manques;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const manques = clesNonTraduites();
  if (manques.length) {
    console.error(`${manques.length} texte(s) identique(s) à l'anglais :`);
    for (const m of manques) console.error(`  ${m.langue} · ${m.cle}`);
    process.exit(1);
  }
  console.log("Traductions OK : aucun texte identique à l'anglais hors exceptions.");
}
