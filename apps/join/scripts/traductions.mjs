// Vérifie que chaque texte de en.json est traduit dans les autres langues de apps/join/src/locales :
// une clé absente est une erreur (24/11), et une clé non vide dont la valeur est identique à l'anglais est une clé
// oubliée, sauf exception listée ici (mots identiques dans la langue, noms propres, sigles). Les variables {x}
// de chaque texte doivent aussi rester les mêmes (sauf {name}, que certaines langues omettent : VARIABLES_FACULTATIVES). Lancer : `npm test` dans apps/join ; aussi vérifié par
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
  "legal.notice.hostTitle": ["cs", "da", "de", "it", "nl", "no", "pl", "sk", "sr"], // Hosting
  "login.code": ["de", "fr", "nl"], // Code
  "privacy.contact.title": ["fr", "nl", "ro"], // 9. Contact
  "privacy.contact.1": ["fr", "ja", "ko"], // adresse en France
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
  "chk.connexion.password": ["it"], // Password
};

const lireDico = (dossier, f) => JSON.parse(readFileSync(join(dossier, f), "utf8"));
const languesDe = (dossier) => readdirSync(dossier).filter((x) => x.endsWith(".json") && x !== "en.json").sort();
const variables = (t) => [...new Set([...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

/**
 * 25/11 : les variables qu'une langue peut omettre. {name} (le prénom) : en polonais, tchèque, croate, serbe,
 * lituanien, letton, un prénom en apostrophe se met au vocatif (« Dziękujemy, Zuzanno! ») : ces langues l'évitent.
 */
export const VARIABLES_FACULTATIVES = ["name"];

/** Mêmes variables que l'anglais (sauf une variable facultative omise), aucune en plus. */
const memesVariables = (t, en) => {
  const a = variables(t);
  const b = variables(en);
  return a.every((v) => b.includes(v)) && b.every((v) => a.includes(v) || VARIABLES_FACULTATIVES.includes(v));
};

/** Les clés de en.json absentes ou vides dans une langue, ou dont les variables {x} diffèrent : [{ langue, cle, motif }]. */
export function clesManquantes(dossier = DOSSIER_LOCALES) {
  const en = lireDico(dossier, "en.json");
  const manques = [];
  for (const f of languesDe(dossier)) {
    const dico = lireDico(dossier, f);
    for (const [cle, valeur] of Object.entries(en)) {
      if (typeof dico[cle] !== "string" || (valeur && !dico[cle].trim())) manques.push({ langue: f.slice(0, -5), cle, motif: "absente" });
      else if (!memesVariables(dico[cle], valeur)) manques.push({ langue: f.slice(0, -5), cle, motif: "variables" });
    }
  }
  return manques;
}

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
  const absentes = clesManquantes();
  if (absentes.length) {
    console.error(`${absentes.length} clé(s) de en.json absente(s) ou aux variables différentes :`);
    for (const m of absentes) console.error(`  ${m.langue} · ${m.cle} (${m.motif})`);
    process.exit(1);
  }
  const manques = clesNonTraduites();
  if (manques.length) {
    console.error(`${manques.length} texte(s) identique(s) à l'anglais :`);
    for (const m of manques) console.error(`  ${m.langue} · ${m.cle}`);
    process.exit(1);
  }
  console.log(`Traductions OK : ${languesDe(DOSSIER_LOCALES).length + 1} langues, toutes les clés de en.json présentes, aucun texte identique à l'anglais hors exceptions.`);
}
