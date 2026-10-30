import { callWithFallback, TEXT_MODELS, textOf } from "../_shared/gemini.ts";
import { type CtaAClasser, FORME_AUTRE, lireClassement, promptClassement } from "../_shared/formes_cta.ts";
import { enParallele } from "../_shared/nettoyage_stickers.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Classement des CTA publiés dans une des 7 formes (0621, docs/cta.md).
 *
 *   { classer: {} }
 *       Répond aussitôt, puis classe en arrière-plan quelques centaines de
 *       textes (Gemini, 40 par appel). Plus de tâche planifiée depuis 0624 :
 *       les vues ne jugent pas un CTA et l'OS ne tire plus de forme. Le
 *       classement fait reste une aide pour choisir les exemples des fiches
 *       label ; on peut le relancer à la main.
 *
 * Rien ici ne change un post.
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
    const body = (await request.json()) as { classer?: unknown };

    // Répondre vite : la tâche planifiée passe par pg_net, qui attend la fin
    // de ses appels avant d'en envoyer d'autres.
    if (body.classer) {
      enArrierePlan(classer(supabase));
      return json({ ok: true });
    }

    return json({ error: "Demande inconnue : classer." }, 400);
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
