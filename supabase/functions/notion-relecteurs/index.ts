import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { cleNotion } from "../_shared/notion.ts";
import {
  baseRelecteurs,
  creerLigne,
  type LangueOs,
  lireLignesRelecteurs,
  majLigne,
  planifierRelecteurs,
  type RelecteurOs,
  type StatutRelecteur,
  TableNonPartagee,
} from "../_shared/notion_relecteurs.ts";

/**
 * Recopie l'état des relecteurs natifs dans la table Notion « Relecteurs
 * natifs » (une ligne par langue), demandée par Adrien le 27/10/2026 : « mis à
 * jour quand j'en accepte un ».
 *
 * Appelée par l'admin juste après chaque changement (un relecteur ajouté, son
 * statut changé ou retiré) et par le bouton « Mettre à jour Notion ». Elle
 * relit tout l'état de l'OS, et
 * n'écrit que les lignes qui changent. Seules les colonnes de l'OS sont
 * touchées (voir `_shared/notion_relecteurs.ts`).
 *
 * Corps accepté :
 *   {}               synchro normale
 *   {"blanc": true}  calcule et renvoie le plan SANS rien écrire
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let blanc = false;
  try {
    blanc = Boolean(((await request.json()) as { blanc?: boolean })?.blanc);
  } catch {
    // corps vide : synchro normale
  }

  const supabase = serviceClient();

  const cle = cleNotion();
  if (!cle) return json({ ok: true, secret_manquant: "NOTION_TOKEN", ecrites: 0 });

  try {
    // Posteurs actifs par langue (comptes actifs de posteurs actifs).
    const [profils, comptes] = await Promise.all([
      supabase.from("profiles").select("id").eq("is_active", true).limit(5000),
      supabase.from("comptes").select("langue, poster_id").eq("is_active", true).limit(5000),
    ]);
    if (profils.error) return json({ error: profils.error.message }, 500);
    if (comptes.error) return json({ error: comptes.error.message }, 500);
    const actifs = new Set((profils.data ?? []).map((p) => p.id as string));
    const posteursParLangue = new Map<string, Set<string>>();
    for (const c of comptes.data ?? []) {
      if (!c.langue || !actifs.has(c.poster_id as string)) continue;
      const ensemble = posteursParLangue.get(c.langue as string) ?? new Set<string>();
      ensemble.add(c.poster_id as string);
      posteursParLangue.set(c.langue as string, ensemble);
    }

    // Posts publiés sur 30 jours, un comptage par langue (pas de lignes rapatriées).
    const depuis = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const langues: LangueOs[] = await Promise.all(
      [...posteursParLangue.entries()].map(async ([code, posteurs]) => {
        const { count, error } = await supabase
          .from("passages")
          .select("id", { count: "exact", head: true })
          .eq("langue", code)
          .eq("statut", "publie")
          .gte("publie_at", depuis);
        if (error) throw new Error(`passages ${code} : ${error.message}`);
        return { code, posteurs: posteurs.size, posts30j: count ?? 0 };
      }),
    );

    // Les relecteurs et leur nom.
    const { data: lignesRelecteurs, error: erreurRelecteurs } = await supabase
      .from("relecteurs_natifs")
      .select("id, profile_id, langue, statut");
    if (erreurRelecteurs) return json({ error: erreurRelecteurs.message }, 500);
    const ids = (lignesRelecteurs ?? []).map((r) => r.profile_id as string);
    const { data: noms, error: erreurNoms } = ids.length
      ? await supabase.from("profiles").select("id, prenom, nom, email").in("id", ids)
      : { data: [], error: null };
    if (erreurNoms) return json({ error: erreurNoms.message }, 500);
    const nomDe = new Map(
      (noms ?? []).map((p) => [
        p.id as string,
        [p.prenom, p.nom].filter(Boolean).join(" ") || (p.email as string | null) || "—",
      ]),
    );

    const relecteurs: RelecteurOs[] = (lignesRelecteurs ?? []).map((r) => ({
      langue: r.langue as string,
      nom: nomDe.get(r.profile_id as string) ?? "—",
      statut: r.statut as StatutRelecteur,
    }));

    const baseId = baseRelecteurs();
    const lignes = await lireLignesRelecteurs(cle, baseId);
    const plan = planifierRelecteurs(langues, relecteurs, lignes);

    const resume = {
      ok: true,
      lignes_notion: lignes.length,
      relecteurs: relecteurs.length,
      inchangees: plan.inchangees,
      a_creer: plan.creations.map((c) => c.code),
      a_modifier: plan.majs.map((m) => m.code),
      doublons: plan.doublons,
    };
    if (blanc) return json({ ...resume, blanc: true, ecrites: 0, plan });

    const maintenant = new Date().toISOString();
    const ecritures = [
      ...plan.creations.map((c) => () => creerLigne(cle, baseId, c, maintenant)),
      ...plan.majs.map((m) => () => majLigne(cle, m.pageId, m.colonnes, maintenant)),
    ];
    let ecrites = 0;
    for (const ecrire of ecritures) {
      await ecrire();
      ecrites += 1;
      // Notion plafonne à ~3 requêtes/seconde.
      if (ecrites < ecritures.length) await new Promise((r) => setTimeout(r, 350));
    }

    return json({ ...resume, ecrites });
  } catch (erreur) {
    if (erreur instanceof TableNonPartagee) {
      return json(
        {
          error:
            "La table Notion « Relecteurs natifs » n'est pas partagée avec l'intégration de l'OS. Dans Notion, sur la page « Relecteurs natifs par pays » : ••• → Connexions → ajouter l'intégration de l'OS.",
          code: "notion_non_partagee",
        },
        502,
      );
    }
    return json({ error: messageErreur(erreur) }, 500);
  }
});
