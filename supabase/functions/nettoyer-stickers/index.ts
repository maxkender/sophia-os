import { lireParLots } from "../_shared/lots.ts";
import { motifRetrait, tierProtege } from "../_shared/nettoyage_stickers.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

/**
 * Nettoyage stickers d'un label : retire des slideshows déjà importés.
 *
 *   { action: "appliquer", contenuIds: string[] (≤ 100), label?: string }
 *     → { retires, ignores: [{ id, raison }], postsARemplacer: string[] }
 *
 * Les contenus viennent du scan à blanc (`test-stickers`, actions `label` puis
 * `analyser`) : la page n'envoie que ceux où l'OCR a vu un sticker PUB (les
 * stickers de contenu restent). On revérifie
 * ici ce qui protège un slideshow, l'écran ayant pu vieillir : encore valide,
 * pas un pod, pas au tier A ou mieux (Sophia ou une autre application).
 * Retirer = `statut = rejete` : il sort de toutes les réserves.
 *
 * `postsARemplacer` : les posts du jour (Paris) pas encore publiés qui
 * utilisaient un slideshow retiré. La page les passe ensuite un par un dans
 * `revoquer-post`, qui refait un post pour le même créateur, le même jour et
 * la même application, sans ce slideshow.
 */

const LOT_MAX = 100;

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let corps: { action?: string; contenuIds?: unknown; label?: string } = {};
  try {
    corps = await request.json();
  } catch {
    // corps vide
  }
  if (corps.action !== "appliquer") return json({ error: "action inconnue (appliquer)" }, 400);

  const ids = Array.isArray(corps.contenuIds)
    ? [...new Set(corps.contenuIds.filter((x): x is string => typeof x === "string" && x.length > 0))]
    : [];
  if (ids.length === 0) return json({ error: "contenuIds requis" }, 400);
  if (ids.length > LOT_MAX) return json({ error: `au plus ${LOT_MAX} contenus par appel` }, 400);

  try {
    const supabase = serviceClient();

    const { data: contenus, error } = await supabase
      .from("contenus")
      .select("id, statut, pod, tier")
      .in("id", ids);
    if (error) throw error;
    const { data: tiersApps, error: eTiers } = await supabase
      .from("contenu_application_tier_etat")
      .select("contenu_id, tier, eligible")
      .in("contenu_id", ids);
    if (eTiers) throw eTiers;

    const tiersParContenu = new Map<string, string[]>();
    for (const t of tiersApps ?? []) {
      if (!t.eligible || !t.tier) continue;
      tiersParContenu.set(t.contenu_id, [...(tiersParContenu.get(t.contenu_id) ?? []), t.tier]);
    }

    const ignores: Array<{ id: string; raison: string }> = [];
    const aRetirer: string[] = [];
    const parId = new Map((contenus ?? []).map((c) => [c.id as string, c]));
    for (const id of ids) {
      const c = parId.get(id);
      if (!c) ignores.push({ id, raison: "introuvable" });
      else if (c.statut !== "valide") ignores.push({ id, raison: `déjà ${c.statut}` });
      else if (c.pod) ignores.push({ id, raison: "pod" });
      else if (tierProtege([c.tier, ...(tiersParContenu.get(id) ?? [])])) {
        ignores.push({ id, raison: "tier A ou mieux" });
      } else aRetirer.push(id);
    }

    if (aRetirer.length > 0) {
      const { error: eMaj } = await supabase
        .from("contenus")
        .update({
          statut: "rejete",
          import_etape: "sticker",
          import_erreur: motifRetrait(corps.label ?? null),
        })
        .in("id", aRetirer)
        .eq("statut", "valide");
      if (eMaj) throw eMaj;
    }

    // Posts du jour pas encore publiés qui utilisaient un slideshow retiré.
    const jour = aujourdhuiParis();
    const passages = aRetirer.length === 0 ? [] : await lireParLots<{ post_id: string | null }>(
      aRetirer,
      "Passages du jour à remplacer",
      (lot) =>
        supabase
          .from("passages")
          .select("post_id")
          .in("contenu_id", lot)
          .eq("date_publication_prevue", jour)
          .eq("statut", "assigne")
          .is("publie_at", null)
          .not("post_id", "is", null),
    );
    const postIds = [...new Set(passages.map((p) => p.post_id).filter((x): x is string => !!x))];
    const posts = postIds.length === 0 ? [] : await lireParLots<{ id: string }>(
      postIds,
      "Posts du jour à remplacer",
      (lot) => supabase.from("posts").select("id").in("id", lot).is("publie_at", null),
    );

    return json({ retires: aRetirer, ignores, postsARemplacer: posts.map((p) => p.id) });
  } catch (error) {
    return json({ error: messageErreur(error) }, 500);
  }
});
