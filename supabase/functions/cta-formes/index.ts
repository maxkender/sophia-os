import { callWithFallback, TEXT_MODELS, textOf } from "../_shared/gemini.ts";
import {
  type AgregatCta,
  type BlocAppli,
  type CtaAClasser,
  FORME_AUTRE,
  ficheLabel,
  lireClassement,
  poidsDesFormes,
  promptClassement,
  type StatutForme,
} from "../_shared/formes_cta.ts";
import { enParallele } from "../_shared/nettoyage_stickers.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Le CTA mesurable (0621, docs/cta.md).
 *
 *   { classer: {} }
 *       Tâche planifiée toutes les 2 minutes tant qu'il reste des CTA publiés
 *       à classer : répond aussitôt, puis classe en arrière-plan quelques
 *       centaines de textes dans une des 7 formes (Gemini, 40 par appel).
 *   { lundi: {} }
 *       Chaque lundi (et sur le bouton de l'OS) : les chiffres à contenu égal
 *       de `cta_agregats()`, les poids du tirage de chaque label et appli dans
 *       `cta_stats`, et une nouvelle version de chaque fiche label dans
 *       `bleo_fiches`. → { semaine, fiches, lignes }
 *
 * Rien ici ne change un post : le tirage lira `cta_stats` à l'étape 5.
 */

type Client = ReturnType<typeof serviceClient>;

const LOT = 40;
const LOTS_PAR_PASSAGE = 9;
const LOTS_EN_PARALLELE = 3;
/** Passé ce délai, plus aucun lot ne part (une fonction Edge s'arrête à 150 s). */
const BUDGET_MS = 100_000;

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();
  try {
    const body = (await request.json()) as { classer?: unknown; lundi?: unknown };

    // Répondre vite : la tâche planifiée passe par pg_net, qui attend la fin
    // de ses appels avant d'en envoyer d'autres.
    if (body.classer) {
      enArrierePlan(classer(supabase));
      return json({ ok: true });
    }

    if (body.lundi) {
      return json({ ok: true, ...(await lundi(supabase)) });
    }

    return json({ error: "Demande inconnue : classer ou lundi." }, 400);
  } catch (erreur) {
    return json({ error: messageErreur(erreur) }, 500);
  }
});

function enArrierePlan(travail: Promise<unknown>) {
  const suivi = travail.catch((erreur) => console.error(`cta-formes : ${messageErreur(erreur)}`));
  const edge = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge) edge.waitUntil(suivi);
}

// ---------------------------------------------------------------------------
// Classer les CTA publiés
// ---------------------------------------------------------------------------

async function classer(supabase: Client) {
  const debut = Date.now();
  const { data, error } = await supabase
    .from("cta_a_classer")
    .select("cta_hash, cta_texte, avant")
    .limit(LOT * LOTS_PAR_PASSAGE);
  if (error) throw new Error(error.message);
  const textes = (data ?? []) as CtaAClasser[];
  const lots: CtaAClasser[][] = [];
  for (let i = 0; i < textes.length; i += LOT) lots.push(textes.slice(i, i + LOT));

  let classes = 0;
  let echecs = 0;
  await enParallele(lots, LOTS_EN_PARALLELE, async (lot) => {
    if (Date.now() - debut > BUDGET_MS) return;
    try {
      const brut = textOf(await callWithFallback(TEXT_MODELS, [{ text: promptClassement(lot) }]));
      const formes = lireClassement(brut, lot.length);
      // Réponse illisible : le lot repart au passage suivant. Lisible mais
      // incomplète : un CTA oublié par le modèle va dans « autre », pour ne pas
      // revenir en file à chaque passage.
      if (formes.size === 0) {
        echecs += lot.length;
        return;
      }
      const lignes = lot.map((c, i) => ({
        cta_hash: c.cta_hash,
        forme: formes.get(i) ?? FORME_AUTRE,
        cta_texte: c.cta_texte.slice(0, 1000),
      }));
      const { error } = await supabase
        .from("cta_formes")
        .upsert(lignes, { onConflict: "cta_hash", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      classes += lignes.length;
    } catch (erreur) {
      echecs += lot.length;
      console.error(`cta-formes classer : ${messageErreur(erreur)}`);
    }
  });
  console.log(
    `cta-formes classer : ${classes} CTA classés, ${echecs} à reprendre, ${Math.round((Date.now() - debut) / 1000)} s`,
  );
  return { classes, echecs };
}

// ---------------------------------------------------------------------------
// Le lundi : chiffres, poids et fiches label
// ---------------------------------------------------------------------------

interface LigneAgregat {
  label: string;
  application_id: string;
  dimension: AgregatCta["dimension"];
  valeur: string;
  n: number;
  contenus: number;
  r_med: number | string | null;
  effet: number | string | null;
  percee: number | string | null;
}

const nombre = (x: number | string | null) => (x === null || x === undefined ? null : Number(x));

async function lundi(supabase: Client) {
  const { data, error } = await supabase.rpc("cta_agregats");
  if (error) throw new Error(`cta_agregats : ${error.message}`);
  const agregats: AgregatCta[] = ((data ?? []) as LigneAgregat[]).map((a) => ({
    label: a.label,
    application_id: a.application_id,
    dimension: a.dimension,
    valeur: a.valeur,
    n: Number(a.n),
    contenus: Number(a.contenus),
    r_med: nombre(a.r_med),
    effet: nombre(a.effet),
    percee: nombre(a.percee),
  }));

  const { data: applis, error: erreurApplis } = await supabase.from("applications").select("id, slug, nom");
  if (erreurApplis) throw new Error(erreurApplis.message);
  const nomAppli = new Map((applis ?? []).map((a) => [a.id as string, (a.nom as string) || (a.slug as string)]));

  const maintenant = new Date();
  const semaine = maintenant.toISOString().slice(0, 10);
  const jour = maintenant.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

  // Le statut de chaque forme au dernier calcul, pour le journal de la fiche.
  const { data: precedents } = await supabase
    .from("cta_stats")
    .select("semaine, label, application_id, valeur, statut")
    .eq("dimension", "forme")
    .lt("semaine", semaine)
    .order("semaine", { ascending: false })
    .limit(5000);
  const derniere = precedents?.[0]?.semaine;
  const avant = new Map<string, Map<string, StatutForme>>();
  for (const p of precedents ?? []) {
    if (p.semaine !== derniere || !p.statut) continue;
    const cle = `${p.label}|${p.application_id}`;
    if (!avant.has(cle)) avant.set(cle, new Map());
    avant.get(cle)!.set(p.valeur as string, p.statut as StatutForme);
  }

  const de = (label: string, appli: string, dimension: AgregatCta["dimension"]) =>
    agregats.filter((a) => a.label === label && a.application_id === appli && a.dimension === dimension);
  const labels = [...new Set(agregats.map((a) => a.label))];
  const stats: Record<string, unknown>[] = [];
  let fiches = 0;

  for (const label of labels) {
    const blocs: BlocAppli[] = [];
    const applisDuLabel = [...new Set(agregats.filter((a) => a.label === label).map((a) => a.application_id))];
    for (const appli of applisDuLabel) {
      const formesMesurees = de(label, appli, "forme").filter((a) => a.valeur !== "non_classee");
      const formes = poidsDesFormes(formesMesurees, label === "*" ? [] : de("*", appli, "forme"));
      const slides = de(label, appli, "slide");
      const places = de(label, appli, "place");
      const voies = de(label, appli, "voie");
      blocs.push({
        appli: nomAppli.get(appli) ?? appli,
        posts: formesMesurees.reduce((s, a) => s + a.n, 0),
        formes,
        slides,
        places,
        voies,
        avant: avant.get(`${label}|${appli}`),
      });

      const parForme = new Map(formesMesurees.map((a) => [a.valeur, a]));
      for (const f of formes) {
        const a = parForme.get(f.forme);
        stats.push({
          semaine,
          label,
          application_id: appli,
          dimension: "forme",
          valeur: f.forme,
          n: f.n,
          contenus: a?.contenus ?? 0,
          r_med: a?.r_med ?? null,
          effet: a?.effet ?? null,
          percee: a?.percee ?? null,
          statut: f.statut,
          poids: f.poids,
        });
      }
      for (const a of [...slides, ...places, ...voies]) {
        stats.push({
          semaine,
          label,
          application_id: appli,
          dimension: a.dimension,
          valeur: a.valeur,
          n: a.n,
          contenus: a.contenus,
          r_med: a.r_med,
          effet: a.effet,
          percee: a.percee,
          statut: null,
          poids: null,
        });
      }
    }

    // La fiche label (pas de fiche pour « * », qui sert de repli).
    if (label === "*") continue;
    const { data: derniereVersion } = await supabase
      .from("bleo_fiches")
      .select("version")
      .eq("sorte", "label")
      .eq("cle", label)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error: erreurFiche } = await supabase.from("bleo_fiches").insert({
      sorte: "label",
      cle: label,
      version: ((derniereVersion?.version as number | undefined) ?? 0) + 1,
      contenu: ficheLabel(label, jour, blocs),
      auteur: "cta-lundi",
    });
    if (erreurFiche) throw new Error(`fiche ${label} : ${erreurFiche.message}`);
    fiches += 1;
  }

  for (let i = 0; i < stats.length; i += 500) {
    const { error: erreurStats } = await supabase
      .from("cta_stats")
      .upsert(stats.slice(i, i + 500), { onConflict: "semaine,label,application_id,dimension,valeur" });
    if (erreurStats) throw new Error(`cta_stats : ${erreurStats.message}`);
  }
  console.log(`cta-formes lundi : ${fiches} fiches label, ${stats.length} lignes de stats`);
  return { semaine, fiches, lignes: stats.length };
}
