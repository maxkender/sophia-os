import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase/client";

import { CLES_REGLES, lireReglesPaie, texteRegle, type Regle, type ReglesPaie } from "./textes";

/** Les règles aux posteurs, lues dans `reglages` (lisible par tous, 0100). */
export async function lireRegles(): Promise<{ textes: Record<Regle, string>; paie: ReglesPaie; slack: string | null }> {
  const { data, error } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", [...Object.values(CLES_REGLES), "paie_minimum_posts", "slack_lien_invitation"]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  return {
    textes: {
      lien: texteRegle(v[CLES_REGLES.lien], "lien"),
      warmup: texteRegle(v[CLES_REGLES.warmup], "warmup"),
      bienvenue: texteRegle(v[CLES_REGLES.bienvenue], "bienvenue"),
    },
    paie: lireReglesPaie(v.paie_minimum_posts),
    slack: typeof v.slack_lien_invitation === "string" && v.slack_lien_invitation.trim() ? v.slack_lien_invitation.trim() : null,
  };
}

/** Les règles, avec le texte par défaut tant que la lecture n'a pas répondu. */
export function useRegles() {
  const q = useQuery({ queryKey: ["regles-posteur"], queryFn: lireRegles, staleTime: 5 * 60_000 });
  return {
    textes: q.data?.textes ?? {
      lien: texteRegle(null, "lien"),
      warmup: texteRegle(null, "warmup"),
      bienvenue: texteRegle(null, "bienvenue"),
    },
    paie: q.data?.paie ?? lireReglesPaie(null),
    /** Le lien d'invitation du réglage, null tant qu'il est vide. */
    slack: q.data?.slack ?? null,
  };
}
