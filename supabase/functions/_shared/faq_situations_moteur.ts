/**
 * Prompt 21, partie Q : la FAQ par situation — partie qui parle au monde (la
 * base, Gemini). La logique de décision est dans `faq_situations.ts`, testée
 * à part. Utilisé par la bulle d'aide (`chatbot`), Slack (`slack-faq`) et
 * l'onglet Test (`faq-admin`, action « tester », qui n'écrit et n'envoie rien).
 */

import {
  calculerSituations,
  choisirReponse,
  construirePromptCorrespondance,
  correspondanceLocale,
  type EntreeFaq,
  type FaitsPosteur,
  lireCorrespondance,
  lireModeSituations,
  type ModeSituations,
  type ReponseSituation,
  type ResultatSituation,
  variablesDe,
  variablesExemple,
} from "./faq_situations.ts";
import { generateTextFast } from "./gemini.ts";
import { messageErreur, type serviceClient } from "./supabase.ts";

type Db = ReturnType<typeof serviceClient>;

export async function chargerModeSituations(db: Db): Promise<ModeSituations> {
  const { data, error } = await db.from("reglages").select("valeur").eq("cle", "faq_automatique").maybeSingle();
  if (error) {
    console.warn(`[faq-situations] réglage illisible, mode test : ${messageErreur(error)}`);
    return "test";
  }
  return lireModeSituations(data?.valeur);
}

/**
 * Qui écrit : le profil connecté (bulle), le profil relié à son ID Slack, ou
 * le posteur de son contrat Upwork. null : inconnu (Candidat).
 */
export async function identifierPosteur(
  db: Db,
  o: { userId?: string | null; slackUserId?: string | null; contratId?: string | null },
): Promise<string | null> {
  if (o.userId) return o.userId;
  if (o.slackUserId) {
    const { data } = await db.from("profiles").select("id").eq("slack_user_id", o.slackUserId).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (o.contratId) {
    const { data } = await db.from("profiles").select("id").eq("upwork_contract_id", o.contratId).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

export async function chargerFaits(db: Db, posterId: string | null): Promise<FaitsPosteur> {
  const { data, error } = await db.rpc("faq_faits_posteur", { p_poster: posterId });
  if (error) throw new Error(`faq_faits_posteur : ${messageErreur(error)}`);
  return data as FaitsPosteur;
}

export interface FaqSituations {
  entrees: EntreeFaq[];
  reponses: ReponseSituation[];
  /** Les situations actives (une désactivée n'est plus donnée). */
  actives: Set<string>;
}

/** Trois petites tables, éditées à la main : 500 lignes est très au-dessus de ce qu'elles contiendront. */
export async function chargerFaqSituations(db: Db): Promise<FaqSituations> {
  const [e, r, s] = await Promise.all([
    db.from("faq_entrees").select("id, question, formulations, actif").eq("actif", true).limit(500),
    db.from("faq_reponses").select("entree_id, situation, texte, actif").eq("actif", true).limit(2000),
    db.from("faq_situations").select("cle, actif").limit(500),
  ]);
  if (e.error) throw new Error(`faq_entrees : ${messageErreur(e.error)}`);
  if (r.error) throw new Error(`faq_reponses : ${messageErreur(r.error)}`);
  if (s.error) throw new Error(`faq_situations : ${messageErreur(s.error)}`);
  return {
    entrees: (e.data ?? []).map((x) => ({ ...x, formulations: (x.formulations ?? []) as string[] })) as EntreeFaq[],
    reponses: (r.data ?? []) as ReponseSituation[],
    actives: new Set((s.data ?? []).filter((x) => x.actif).map((x) => String(x.cle))),
  };
}

/**
 * La question est-elle une entrée de la FAQ ? D'abord mot pour mot (sans
 * modèle), sinon le modèle choisit parmi les entrées (null dans le doute).
 * Un modèle en panne vaut « aucune » : le bot répond comme avant.
 */
export async function reconnaitre(
  question: string,
  entrees: EntreeFaq[],
  generer: (prompt: string) => Promise<string> = generateTextFast,
): Promise<{ entree: EntreeFaq | null; correspondance: "locale" | "ia" | null }> {
  const locale = correspondanceLocale(question, entrees);
  if (locale) return { entree: locale, correspondance: "locale" };
  if (!entrees.some((e) => e.actif)) return { entree: null, correspondance: null };
  try {
    const ia = lireCorrespondance(await generer(construirePromptCorrespondance(question, entrees)), entrees);
    return { entree: ia, correspondance: ia ? "ia" : null };
  } catch (erreur) {
    console.warn(`[faq-situations] correspondance indisponible : ${messageErreur(erreur)}`);
    return { entree: null, correspondance: null };
  }
}

/**
 * Tout le chemin : la situation de la personne, la question reconnue, la
 * réponse remplie. Ne lit que : rien n'est écrit, rien n'est envoyé.
 *
 *  - `posterId` : un vrai posteur (null : inconnu, Candidat) ;
 *  - `situation` : l'onglet Test sans posteur (valeurs d'exemple) ;
 *  - `role` : un manager connu sans profil de posteur (Slack) est « hm ».
 */
export async function repondreParSituation(
  db: Db,
  o: {
    question: string;
    posterId?: string | null;
    situation?: string | null;
    role?: string | null;
    generer?: (prompt: string) => Promise<string>;
    faq?: FaqSituations;
  },
): Promise<ResultatSituation> {
  const faq = o.faq ?? (await chargerFaqSituations(db));
  const faits = await chargerFaits(db, o.situation ? null : (o.posterId ?? null));
  let situations: string[];
  let variables;
  if (o.situation) {
    situations = [o.situation];
    variables = variablesExemple(o.situation, faits.aujourdhui, faits.cohorte_candidat);
  } else {
    // Un manager écrit sur Slack sans profil relié à son ID : l'appelant sait que c'est un manager.
    const f = !faits.trouve && o.role && o.role !== "poster" ? { ...faits, trouve: true, role: o.role } : faits;
    situations = calculerSituations(f, faq.actives);
    variables = variablesDe(f);
  }
  const { entree, correspondance } = await reconnaitre(o.question, faq.entrees, o.generer);
  const choix = entree ? choisirReponse(entree.id, faq.reponses, situations, variables) : { choisie: null, sautees: [] };
  return {
    situation: situations[0] ?? null,
    situations,
    entree: entree ? { id: entree.id, question: entree.question } : null,
    correspondance,
    reponse: choix.choisie,
    variables,
    sautees: choix.sautees,
  };
}

/** Les colonnes de `chatbot_questions` (0424) qui gardent la situation et la réponse par situation. */
export function colonnesSituation(r: ResultatSituation | null): Record<string, unknown> {
  if (!r) return {};
  return {
    situation: r.situation,
    situations: r.situations,
    faq_entree_id: r.entree?.id ?? null,
    reponse_situation: r.reponse?.texte ?? null,
  };
}

/** Comme `repondreParSituation`, mais une panne ne casse jamais le bot : null, il répond comme avant. */
export async function situationSansRisque(
  db: Db,
  o: Parameters<typeof repondreParSituation>[1],
): Promise<ResultatSituation | null> {
  try {
    return await repondreParSituation(db, o);
  } catch (erreur) {
    console.warn(`[faq-situations] indisponible : ${messageErreur(erreur)}`);
    return null;
  }
}
