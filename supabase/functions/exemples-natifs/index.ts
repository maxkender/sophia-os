import { listerPostsProfil, scrapePost } from "../_shared/apify.ts";
import {
  lireLignes,
  MAX_COMPTES_PAR_APPEL,
  POSTS_LUS_PAR_COMPTE,
  motifRefus,
  pseudoDuLien,
  slideshowsDuCompte,
  slidesLues,
} from "../_shared/exemples_natifs.ts";
import { ocrFrame } from "../_shared/gemini.ts";
import { LANGUES_CIBLES } from "../_shared/langues_cibles.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Banque d'exemples natifs (0423) : des slideshows de vrais créateurs de
 * chaque langue, lus par la traduction ancrée.
 *
 *   { ajouter: { langue, labelId?, texte } }
 *       Lit les liens et comptes collés (un par ligne, 4 comptes au plus : le
 *       navigateur découpe). Un compte donne ses 5 slideshows les plus
 *       récents et ses 5 plus likés. Crée une ligne « en_attente » par slideshow ; rien n'est
 *       encore lu. → { ajoutes, deja, comptes, ignorees }
 *   { traiter: { id } }
 *       Récupère le slideshow (Apify) et lit le texte de chaque slide (OCR).
 *       Un exemple par appel : le navigateur enchaîne, sans risquer le
 *       délai de 150 s d'une fonction Edge. → { statut, erreur? }
 *
 * Rien n'est publié : ces slideshows ne deviennent jamais des contenus.
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();
  try {
    const body = (await request.json()) as {
      ajouter?: { langue?: string; labelId?: string | null; texte?: string };
      traiter?: { id?: string };
    };

    if (body.ajouter) {
      const langue = String(body.ajouter.langue ?? "");
      if (!(LANGUES_CIBLES as readonly string[]).includes(langue)) {
        return json({ error: `Langue inconnue : « ${langue} »` }, 400);
      }
      const labelId = body.ajouter.labelId || null;
      const lues = lireLignes(String(body.ajouter.texte ?? ""));
      // Rien de reconnu dans ce paquet : on le dit, sans erreur (le navigateur
      // envoie les lignes par paquets et fait le compte à la fin).
      if (!lues.posts.length && !lues.comptes.length) {
        return json({ ok: true, ajoutes: 0, deja: 0, comptes: [], ignorees: lues.ignorees });
      }
      if (lues.comptes.length > MAX_COMPTES_PAR_APPEL) {
        return json({ error: `${MAX_COMPTES_PAR_APPEL} comptes au plus par appel.` }, 400);
      }

      // Un compte donne ses slideshows les plus récents ; les comptes du
      // paquet sont listés en parallèle.
      const comptes = await Promise.all(
        lues.comptes.map(async (pseudo) => {
          try {
            const trouves = slideshowsDuCompte(await listerPostsProfil(pseudo, POSTS_LUS_PAR_COMPTE));
            return { pseudo, slideshows: trouves.length, trouves };
          } catch (erreur) {
            return { pseudo, slideshows: 0, trouves: [] as string[], erreur: messageErreur(erreur) };
          }
        }),
      );
      const urls = [...lues.posts];
      for (const c of comptes) for (const u of c.trouves) if (!urls.includes(u)) urls.push(u);

      const { data: existants, error: erreurExistants } = await supabase
        .from("exemples_natifs")
        .select("source_url")
        .eq("langue", langue)
        .in("source_url", urls.length ? urls : ["-"]);
      if (erreurExistants) return json({ error: erreurExistants.message }, 500);
      const deja = new Set((existants ?? []).map((e) => e.source_url as string));
      const nouveaux = urls.filter((u) => !deja.has(u));
      if (nouveaux.length) {
        const { error } = await supabase.from("exemples_natifs").insert(
          nouveaux.map((source_url) => ({
            langue,
            source_url,
            handle: pseudoDuLien(source_url),
            label_id: labelId,
          })),
        );
        if (error) return json({ error: error.message }, 500);
      }
      return json({
        ok: true,
        ajoutes: nouveaux.length,
        deja: deja.size,
        comptes: comptes.map(({ pseudo, slideshows, erreur }) => ({ pseudo, slideshows, ...(erreur ? { erreur } : {}) })),
        ignorees: lues.ignorees,
      });
    }

    if (body.traiter?.id) {
      const { data: exemple, error } = await supabase
        .from("exemples_natifs")
        .select("id, source_url")
        .eq("id", body.traiter.id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!exemple) return json({ error: "Exemple introuvable" }, 404);

      const echec = async (motif: string) => {
        await supabase.from("exemples_natifs").update({ statut: "erreur", erreur: motif }).eq("id", exemple.id);
        return json({ ok: true, statut: "erreur", erreur: motif });
      };

      let post;
      try {
        [post] = await scrapePost(exemple.source_url as string);
      } catch (erreur) {
        return await echec(`Apify : ${messageErreur(erreur)}`);
      }
      if (!post) return await echec("Post introuvable, supprimé ou privé.");

      // OCR de toutes les slides, 4 à la fois.
      const textes: string[] = new Array(post.imageUrls.length).fill("");
      for (let i = 0; i < post.imageUrls.length; i += 4) {
        const lot = post.imageUrls.slice(i, i + 4);
        const lus = await Promise.all(lot.map((url) => ocrFrame(url).catch(() => "")));
        lus.forEach((t, j) => (textes[i + j] = t));
      }
      const slides = slidesLues(textes);
      const refus = motifRefus(post.imageUrls.length, slides);
      if (refus) return await echec(refus);

      const { error: erreurMaj } = await supabase
        .from("exemples_natifs")
        .update({
          statut: "pret",
          erreur: null,
          slides,
          vues: post.stats.vues || null,
          handle: pseudoDuLien(post.webVideoUrl) ?? pseudoDuLien(exemple.source_url as string),
        })
        .eq("id", exemple.id);
      if (erreurMaj) return json({ error: erreurMaj.message }, 500);
      return json({ ok: true, statut: "pret", slides: slides.length });
    }

    return json({ error: "Demande inconnue : ajouter ou traiter." }, 400);
  } catch (erreur) {
    return json({ error: messageErreur(erreur) }, 500);
  }
});
