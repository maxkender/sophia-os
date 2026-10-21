/**
 * Localisation scolaire des traductions de slideshows (21/10).
 *
 * Une slide « I got A* in all my A-levels » ne doit pas arriver telle quelle
 * dans un deck turc. Le prompt `localisation_scolaire` (modifiable dans
 * Admin → Prompts) porte la règle et une ligne par pays (`TR : …`). Il est
 * ajouté à TOUTE traduction de deck, quelle que soit la langue, avec le système
 * scolaire cible :
 *
 *  - la langue n'est publiée que dans UN pays chez nous (cas général : `tr` =
 *    Turquie, `de` = Allemagne, `es` = Espagne…) : la ligne de ce pays ;
 *  - la langue est publiée dans PLUSIEURS pays (`es-419` : Argentine, Chili,
 *    Colombie, Uruguay, quatre barèmes ; `en` ; `ar`), ou dans un pays sans
 *    ligne : des mots neutres, ni barème chiffré ni examen national.
 *
 * Le pays se lit sur les comptes actifs de la langue, à chaque traduction :
 * la traduction est faite une fois par langue et partagée par tous ses
 * comptes, toutes applications confondues. Le jour où un pays s'ouvre dans une
 * langue déjà là (l'Autriche en `de`), la langue passe en mots neutres toute
 * seule, sans toucher au prompt.
 *
 * Prompt absent ou vide : rien n'est ajouté, la traduction reste celle d'avant.
 */

import { chargerPrompt, messageErreur, serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

export const CLE_PROMPT_LOCALISATION_SCOLAIRE = "localisation_scolaire";

const LIGNE_PAYS = /^\s*([A-Z]{2})\s*:\s*(.+?)\s*$/;

/** Sépare la règle (texte libre) des lignes pays (`XX : …`). */
export function lireLocalisationScolaire(prompt: string): { regle: string; parPays: Map<string, string> } {
  const parPays = new Map<string, string>();
  const regle: string[] = [];
  for (const ligne of prompt.split("\n")) {
    const m = ligne.match(LIGNE_PAYS);
    if (m) parPays.set(m[1], m[2]);
    else regle.push(ligne);
  }
  return { regle: regle.join("\n").trim(), parPays };
}

/**
 * Le bloc ajouté aux règles de traduction, pour les pays (codes ISO) des
 * comptes de la langue. `null` sans prompt.
 */
export function blocLocalisationScolaire(prompt: string | null | undefined, pays: readonly string[]): string | null {
  if (!prompt?.trim()) return null;
  const { regle, parPays } = lireLocalisationScolaire(prompt);
  const distincts = [...new Set(pays.map((p) => p.trim().toUpperCase()).filter(Boolean))].sort();
  const seul = distincts.length === 1 ? parPays.get(distincts[0]) : undefined;
  const cible = seul
    ? `SYSTÈME SCOLAIRE CIBLE : ${distincts[0]} · ${seul}`
    : "SYSTÈME SCOLAIRE CIBLE : aucun en particulier" +
      (distincts.length > 1 ? ` (cette langue est publiée dans plusieurs pays : ${distincts.join(", ")})` : "") +
      ". Ne cite aucun barème chiffré, aucun examen ni niveau national : dis-le en mots " +
      "(« la meilleure note », « une moyenne parfaite », « mes examens de fin d'année », " +
      "« l'examen d'entrée à l'université »), dans la langue de sortie.";
  return [regle, cible].filter(Boolean).join("\n\n");
}

/** Pays des comptes actifs d'une langue. Lève sur une lecture en panne. */
export async function paysDesComptesDeLangue(supabase: Supabase, langue: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("comptes")
    .select("pays")
    .eq("langue", langue)
    .neq("is_active", false)
    .not("pays", "is", null);
  if (error) throw new Error(`comptes (pays de ${langue}) : ${messageErreur(error)}`);
  return [...new Set(((data ?? []) as { pays: string | null }[]).map((c) => c.pays ?? "").filter(Boolean))];
}

/**
 * Le bloc pour une traduction vers `langue`, ou `null` (pas de prompt). Une
 * lecture des comptes en panne ne bloque pas la traduction : mots neutres.
 */
export async function regleLocalisationScolaire(supabase: Supabase, langue: string): Promise<string | null> {
  const prompt = await chargerPrompt(supabase, CLE_PROMPT_LOCALISATION_SCOLAIRE);
  if (!prompt) return null;
  let pays: string[] = [];
  try {
    pays = await paysDesComptesDeLangue(supabase, langue);
  } catch (error) {
    console.warn(`[localisation scolaire] ${langue} : ${messageErreur(error)}, mots neutres`);
  }
  return blocLocalisationScolaire(prompt, pays);
}
