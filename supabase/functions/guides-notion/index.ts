import { cleNotion } from "../_shared/notion.ts";
import {
  clientNotion,
  copierGuide,
  type CopieExistante,
  idNotion,
  type PageRecopiee,
  type PageVisitee,
} from "../_shared/notion_guides.ts";
import { liensPublics } from "../_shared/guide_public.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * guides-notion — recopie le Poster Guide et le Manager Guide de Notion dans
 * `guides_notion`, pour le cerveau de la FAQ (docs/faq-automatique.md).
 * Appelée toutes les heures par le cron du même nom (migration 0331), ou par
 * l'admin depuis la page Assistant (« Recopier maintenant »).
 *
 *   {}               → le passage : seules les pages modifiées sont relues
 *   { force: true }  → tout est relu
 *
 * Le jeton est celui qui écrit déjà « Hired » dans Recruitment Targets
 * (`NOTION_TOKEN`) : l'intégration doit être connectée aux deux guides.
 */

/** La limite d'une fonction Edge est de 150 s (plan gratuit) : on garde de la marge. */
const DUREE_MAX_MS = 110_000;

const GUIDES = [
  {
    guide: "poster" as const,
    nom: "Poster Guide",
    racine: () => Deno.env.get("NOTION_GUIDE_POSTER") ?? "3f4241308d6681f8ad41dc507f2c8505",
  },
  {
    guide: "manager" as const,
    nom: "Manager Guide",
    racine: () => Deno.env.get("NOTION_GUIDE_MANAGER") ?? "3f4241308d66818c84f3c3eb514f140c",
  },
];

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let force = false;
  try {
    force = Boolean((await request.json())?.force);
  } catch {
    // Corps vide : passage du cron.
  }

  // Convention du projet (cf. notion-hired) : sans jeton, on ne lève pas.
  const token = cleNotion();
  if (!token) return json({ ok: false, error: "NOTION_TOKEN absent : rien n'est copié" });

  const db = serviceClient();
  try {
    const { data: lignes, error } = await db
      .from("guides_notion")
      .select("page_id, guide, notion_modifie_at, enfants, copie_at")
      .limit(500);
    if (error) throw error;
    const existants = new Map<string, CopieExistante>(
      (lignes ?? []).map((l) => [l.page_id as string, l as CopieExistante]),
    );

    const client = clientNotion(token);
    // Sous la limite de durée d'une fonction Edge : au-delà, la copie s'arrête
    // proprement, et le passage suivant reprend où elle en était.
    const echeance = Date.now() + DUREE_MAX_MS;
    const bilan = [];
    for (const g of GUIDES) {
      const res = await copierGuide({
        client,
        guide: g.guide,
        racine: g.racine(),
        nomGuide: g.nom,
        existants,
        force,
        echeance,
        surPage: (page) => enregistrer(db, page),
      });

      // Une page sortie du guide sort de la copie, mais seulement après un
      // passage complet : une erreur en route laisserait croire qu'elle a disparu.
      let retirees = 0;
      const vues = [...res.recopiees, ...res.inchangees].map((p) => p.page_id);
      if (!res.erreurs.length && vues.length) {
        const anciennes = (lignes ?? [])
          .filter((l) => l.guide === g.guide && !vues.includes(idNotion(String(l.page_id))))
          .map((l) => String(l.page_id));
        if (anciennes.length) {
          const { error: supprErreur } = await db.from("guides_notion").delete().in("page_id", anciennes);
          if (supprErreur) res.erreurs.push(`suppression : ${messageErreur(supprErreur)}`);
          else retirees = anciennes.length;
        }
      }
      bilan.push({
        guide: g.guide,
        recopiees: res.recopiees.length,
        inchangees: res.inchangees.length,
        retirees,
        erreurs: res.erreurs,
      });
    }
    return json({ ok: bilan.every((b) => !b.erreurs.length), guides: bilan });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

/**
 * Une page à la fois, dès qu'elle est lue. Une page inchangée ne porte ni
 * `texte` ni `enfants` : l'upsert ne réécrit que les colonnes envoyées, sa
 * copie reste intacte.
 */
async function enregistrer(
  db: ReturnType<typeof serviceClient>,
  page: PageRecopiee | PageVisitee,
): Promise<void> {
  // Le Poster Guide : liens et adresse de page vers le site public (les posteurs n'ont pas accès à app.notion.com).
  const publique = page.guide === "poster"
    ? { ...page, url: liensPublics(page.url), ...("texte" in page && typeof page.texte === "string" ? { texte: liensPublics(page.texte) } : {}) }
    : page;
  const { error } = await db.from("guides_notion").upsert(publique, { onConflict: "page_id" });
  if (error) throw new Error(`guides_notion (${page.chemin}) : ${messageErreur(error)}`);
}
