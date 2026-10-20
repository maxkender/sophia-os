import { lireParLots, lireTout } from "./lots.ts";
import { slidesAvecImage, tierProtege } from "./nettoyage_stickers.ts";
import type { serviceClient } from "./supabase.ts";

type Client = ReturnType<typeof serviceClient>;

export interface SlideshowDuLabel {
  id: string;
  titre: string | null;
  created_at: string;
  tier: string | null;
  slides: Array<{ position: number; url: string }>;
}

/**
 * Les slideshows valides d'un label que le nettoyage stickers peut retirer :
 * hors pods, hors tier A ou mieux (Sophia ou une autre application), avec des
 * images brutes à lire. Les écartés ne sont que comptés. Lecture paginée :
 * PostgREST plafonne une réponse à 1 000 lignes, un label en compte plus.
 */
export async function slideshowsDuLabel(supabase: Client, labelId: string) {
  const liens = await lireTout<{ contenu_id: string }>(
    "Slideshows du label",
    (curseur, taille) => {
      let q = supabase.from("contenu_labels").select("contenu_id").eq("label_id", labelId);
      if (curseur) q = q.gt("contenu_id", curseur.contenu_id);
      return q.order("contenu_id", { ascending: true }).limit(taille);
    },
    { ancre: (l) => l.contenu_id },
  );
  const ids = liens.map((l) => l.contenu_id);

  const contenus = await lireParLots<Record<string, unknown>>(
    ids,
    "Contenus du label",
    (lot) =>
      supabase
        .from("contenus")
        .select("id, titre, created_at, tier, pod, structure_slides")
        .eq("statut", "valide")
        .in("id", lot),
  );
  const tiersApps = await lireParLots<{ contenu_id: string; tier: string | null; eligible: boolean | null }>(
    contenus.map((c) => c.id as string),
    "Tiers des autres applications",
    (lot) => supabase.from("contenu_application_tier_etat").select("contenu_id, tier, eligible").in("contenu_id", lot),
  );
  const tiersParContenu = new Map<string, string[]>();
  for (const t of tiersApps) {
    if (!t.eligible || !t.tier) continue;
    tiersParContenu.set(t.contenu_id, [...(tiersParContenu.get(t.contenu_id) ?? []), t.tier]);
  }

  let pods = 0;
  let proteges = 0;
  let sansImages = 0;
  const slideshows: SlideshowDuLabel[] = [];
  for (const c of contenus) {
    const id = c.id as string;
    if (c.pod) {
      pods += 1;
      continue;
    }
    const tier = (c.tier as string | null) ?? null;
    if (tierProtege([tier, ...(tiersParContenu.get(id) ?? [])])) {
      proteges += 1;
      continue;
    }
    const slides = slidesAvecImage(c.structure_slides);
    if (slides.length === 0) {
      sansImages += 1;
      continue;
    }
    slideshows.push({
      id,
      titre: (c.titre as string | null) ?? null,
      created_at: c.created_at as string,
      tier,
      slides,
    });
  }
  slideshows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { slideshows, total: contenus.length, pods, proteges, sansImages };
}
