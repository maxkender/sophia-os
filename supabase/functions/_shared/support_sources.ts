/**
 * 0680 (Max, 12/11) : le bot lit EXACTEMENT ce que montre Support, rien d'autre.
 *   Consignes  : support_consignes + regles_bots (actives).
 *   Catalogue  : reponses_officielles (validées) + chatbot_contexte + FAQ par situation (actives, bonne plateforme).
 *   Documents  : support_documents + guides_notion + documents (actifs, pour les posteurs).
 * Les « Règles qui changent » (support_infos) sont lues à part, comme avant.
 */
import { calculerSituations, choisirReponse, type FaitsPosteur, type ReponseSituation, variablesDe } from "./faq_situations.ts";
import { liensPublics } from "./guide_public.ts";
import { messageErreur, type serviceClient } from "./supabase.ts";

type Db = ReturnType<typeof serviceClient>;
export type Plateforme = "ruul" | "upwork";

export interface EntreeCatalogueBot {
  id: string;
  question: string;
  formulations: string[];
  reponse: string;
  action: string | null;
  niveau: string;
  categorie: string | null;
}

export interface DocumentBot {
  titre: string;
  texte: string;
}

export interface SourcesSupport {
  consignes: string[];
  catalogue: EntreeCatalogueBot[];
  documents: DocumentBot[];
}

/** Plafond des documents dans le prompt : le Poster Guide (≈ 35 000 signes) tient dedans. */
export const PLAFOND_DOCUMENTS = 60_000;

/** chatbot_contexte : « Question : …\n\nRéponse : … » → la réponse seule. */
export function reponseCtx(contenu: string): string {
  const t = (contenu ?? "").replace(/<[^>]+>/g, " ");
  const i = t.search(/R[ée]ponse\s*:/i);
  return (i >= 0 ? t.slice(i).replace(/^R[ée]ponse\s*:\s*/i, "") : t).trim();
}

/** Une ligne s'applique-t-elle à cette plateforme ? (« tous », ou la sienne ; plateforme inconnue : toutes). */
export function pourPlateforme(portee: string | null | undefined, plateforme: Plateforme | null): boolean {
  const p = portee ?? "tous";
  return p === "tous" || !plateforme || p === plateforme;
}

/** Les documents dans l'ordre, coupés au plafond (le reste est signalé, jamais inventé). */
export function documentsDansLePlafond(docs: DocumentBot[], plafond = PLAFOND_DOCUMENTS): DocumentBot[] {
  const garde: DocumentBot[] = [];
  let total = 0;
  for (const d of docs) {
    const texte = d.texte.trim();
    if (!texte) continue;
    if (total + texte.length > plafond) {
      const reste = plafond - total;
      if (reste > 500) garde.push({ titre: d.titre, texte: `${texte.slice(0, reste)}\n[…coupé]` });
      break;
    }
    garde.push({ titre: d.titre, texte });
    total += texte.length;
  }
  return garde;
}

/** La FAQ par situation, déjà remplie pour cette personne (une réponse par question type au plus). */
export function faqPourLaPersonne(
  entrees: { id: string; question: string; formulations: string[] | null; categorie: string | null }[],
  reponses: (ReponseSituation & { id: string; portee: string })[],
  faits: FaitsPosteur,
  actives: ReadonlySet<string>,
  plateforme: Plateforme | null,
): EntreeCatalogueBot[] {
  const situations = calculerSituations(faits, actives);
  const vars = variablesDe(faits);
  const valables = reponses.filter((r) => pourPlateforme(r.portee, plateforme));
  const sortie: EntreeCatalogueBot[] = [];
  for (const e of entrees) {
    const { choisie } = choisirReponse(e.id, valables, situations, vars);
    if (!choisie) continue;
    const r = valables.find((x) => x.entree_id === e.id && x.situation === choisie.situation);
    sortie.push({
      id: `faq:${r?.id ?? e.id}`,
      question: e.question,
      formulations: e.formulations ?? [],
      reponse: choisie.texte,
      action: null,
      niveau: "bot",
      categorie: e.categorie,
    });
  }
  return sortie;
}

/** Tout ce que le bot Help peut utiliser, lu là où Support le montre. Une table illisible est sautée, pas fatale. */
export async function chargerSourcesSupport(
  db: Db,
  o: { plateforme: Plateforme | null; poster: string | null },
): Promise<SourcesSupport> {
  let officielles = db.from("reponses_officielles").select("id, question, formulations, reponse, action, niveau, categorie, portee")
    .eq("actif", true).not("valide_at", "is", null);
  if (o.plateforme) officielles = officielles.in("portee", ["tous", o.plateforme]);
  const [consMax, consRegles, ro, ctx, docs, notion, anciens, entrees, reponses, situations] = await Promise.all([
    db.from("support_consignes").select("texte").eq("actif", true).order("cree_at").limit(200),
    db.from("regles_bots").select("regle").eq("active", true).order("created_at").limit(200),
    officielles.order("ordre").limit(300),
    db.from("chatbot_contexte").select("id, titre, contenu, audience, portee, categorie").eq("actif", true).limit(500),
    db.from("support_documents").select("titre, contenu, audience, ordre").eq("actif", true).order("ordre").limit(200),
    db.from("guides_notion").select("chemin, texte, ordre, guide").eq("bot_actif", true).eq("guide", "poster").order("ordre").limit(500),
    db.from("documents").select("titre, contenu, audience, ordre").eq("bot_actif", true).eq("audience", "poster").order("ordre").limit(100),
    db.from("faq_entrees").select("id, question, formulations, categorie").eq("actif", true).limit(500),
    db.from("faq_reponses").select("id, entree_id, situation, texte, actif, portee").eq("actif", true).limit(2000),
    db.from("faq_situations").select("cle, actif").limit(500),
  ]);
  for (const [nom, r] of Object.entries({ consMax, consRegles, ro, ctx, docs, notion, anciens, entrees, reponses, situations })) {
    if (r.error) console.warn(`[support] source ${nom} illisible : ${messageErreur(r.error)}`);
  }

  const catalogue: EntreeCatalogueBot[] = [
    ...((ro.data ?? []) as (EntreeCatalogueBot & { portee: string })[]).map((c) => ({
      id: c.id, question: c.question, formulations: c.formulations ?? [], reponse: c.reponse, action: c.action, niveau: c.niveau, categorie: c.categorie,
    })),
    ...((ctx.data ?? []) as { id: string; titre: string; contenu: string; audience: string | null; portee: string; categorie: string | null }[])
      .filter((c) => (c.audience ?? "all") !== "hiring_manager" && pourPlateforme(c.portee, o.plateforme))
      .map((c) => ({ id: `ctx:${c.id}`, question: c.titre, formulations: [], reponse: reponseCtx(c.contenu), action: null, niveau: "bot", categorie: c.categorie }))
      .filter((c) => c.reponse),
  ];

  // FAQ par situation : seulement pour une vraie personne (sa situation choisit la réponse et remplit les dates).
  if (o.poster && !entrees.error && !reponses.error) {
    const { data: faits, error } = await db.rpc("faq_faits_posteur", { p_poster: o.poster });
    if (error) console.warn(`[support] faits du posteur illisibles : ${messageErreur(error)}`);
    else if (faits) {
      const actives = new Set(((situations.data ?? []) as { cle: string; actif: boolean }[]).filter((s) => s.actif).map((s) => s.cle));
      catalogue.push(...faqPourLaPersonne(
        (entrees.data ?? []) as { id: string; question: string; formulations: string[] | null; categorie: string | null }[],
        (reponses.data ?? []) as (ReponseSituation & { id: string; portee: string })[],
        faits as FaitsPosteur, actives, o.plateforme,
      ));
    }
  }

  const documents = documentsDansLePlafond([
    ...((docs.data ?? []) as { titre: string; contenu: string; audience: string }[])
      .filter((d) => d.audience !== "hm").map((d) => ({ titre: d.titre, texte: d.contenu })),
    ...((notion.data ?? []) as { chemin: string; texte: string | null }[]).map((p) => ({ titre: p.chemin, texte: liensPublics(p.texte ?? "") })),
    ...((anciens.data ?? []) as { titre: string; contenu: string | null }[]).map((d) => ({ titre: d.titre, texte: d.contenu ?? "" })),
  ]);

  return {
    consignes: [
      ...((consMax.data ?? []) as { texte: string }[]).map((c) => c.texte),
      ...((consRegles.data ?? []) as { regle: string }[]).map((c) => c.regle),
    ],
    catalogue,
    documents,
  };
}
