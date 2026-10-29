import { listerPostsProfil, scrapePost } from "../_shared/apify.ts";
import {
  lireLignes,
  motifRefus,
  pseudoDuLien,
  slideshowsDuCompte,
  slidesLues,
} from "../_shared/exemples_natifs.ts";
import { ocrFrame } from "../_shared/gemini.ts";
import { LANGUES_CIBLES } from "../_shared/langues_cibles.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Banque d'exemples natifs (0380) : des slideshows de vrais créateurs de
 * chaque langue, lus par la traduction ancrée.
 *
 *   { ajouter: { langue, labelId?, texte } }
 *       Lit les liens et comptes collés (un par ligne). Un compte donne ses
 *       5 slideshows les plus récents. Crée une ligne « en_attente » par
 *       slideshow ; rien n'est encore lu. → { ajoutes, deja, comptes, ignorees }
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
      if (!lues.posts.length && !lues.comptes.length) {
        return json({ error: "Aucun lien TikTok ni compte reconnu.", ignorees: lues.ignorees }, 400);
      }

      // Un compte donne ses slideshows les plus récents.
      const comptes: Array<{ pseudo: string; slideshows: number; erreur?: string }> = [];
      const urls = [...lues.posts];
      for (const pseudo of lues.comptes) {
        try {
          const trouves = slideshowsDuCompte(await listerPostsProfil(pseudo, 30));
          comptes.push({ pseudo, slideshows: trouves.length });
          for (const u of trouves) if (!urls.includes(u)) urls.push(u);
        } catch (erreur) {
          comptes.push({ pseudo, slideshows: 0, erreur: messageErreur(erreur) });
        }
      }

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
      return json({ ok: true, ajoutes: nouveaux.length, deja: deja.size, comptes, ignorees: lues.ignorees });
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
