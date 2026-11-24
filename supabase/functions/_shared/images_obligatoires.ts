/**
 * 24/11 (demande : « pour noctorya et glacis1 ça tient pas si c'est pas la bonne image ») : les labels où l'image EST le
 * sujet de la slide (un tableau commenté, une scène d'histoire de l'art). Une slide qu'on n'arrive pas à nettoyer n'y
 * est jamais remplacée par une image d'un autre post du label, ni gardée brute avec son texte : elle est retentée
 * jusqu'au bout de ses essais, puis le slideshow est écarté (« nettoyage raté »).
 *
 * Réglage : `reglages.nettoyage` = { images_obligatoires_labels: [label_id…], images_obligatoires_sources: [compte_reference_id…] }.
 */
import type { serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

export interface RegleImagesObligatoires {
  labels: string[];
  sources: string[];
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);

/** Le réglage tel qu'il est en base (absent, mal formé : aucune règle). */
export function lireRegleImagesObligatoires(valeur: unknown): RegleImagesObligatoires {
  const v = (valeur && typeof valeur === "object" ? valeur : {}) as Record<string, unknown>;
  return { labels: ids(v.images_obligatoires_labels), sources: ids(v.images_obligatoires_sources) };
}

/** Ce slideshow doit-il garder ses propres images ? */
export function imagesObligatoires(
  regle: RegleImagesObligatoires,
  o: { compteReferenceId: string | null | undefined; labelIds: string[] },
): boolean {
  if (o.compteReferenceId && regle.sources.includes(o.compteReferenceId)) return true;
  return o.labelIds.some((l) => regle.labels.includes(l));
}

/** Lit la règle et les labels du contenu (ceux du contenu, et ceux de sa source). */
export async function chargerImagesObligatoires(
  supabase: Supabase,
  contenu: { id: string; compte_reference_id?: string | null },
): Promise<boolean> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "nettoyage").maybeSingle();
  const regle = lireRegleImagesObligatoires((data as { valeur?: unknown } | null)?.valeur);
  if (regle.labels.length === 0 && regle.sources.length === 0) return false;
  if (contenu.compte_reference_id && regle.sources.includes(contenu.compte_reference_id)) return true;
  if (regle.labels.length === 0) return false;

  const [duContenu, deLaSource] = await Promise.all([
    supabase.from("contenu_labels").select("label_id").eq("contenu_id", contenu.id),
    contenu.compte_reference_id
      ? supabase.from("compte_reference_labels").select("label_id").eq("compte_reference_id", contenu.compte_reference_id)
      : Promise.resolve({ data: [] as { label_id: string }[] }),
  ]);
  const labelIds = [
    ...((duContenu.data ?? []) as { label_id: string }[]),
    ...((deLaSource.data ?? []) as { label_id: string }[]),
  ].map((l) => l.label_id);
  return imagesObligatoires(regle, { compteReferenceId: contenu.compte_reference_id, labelIds });
}
