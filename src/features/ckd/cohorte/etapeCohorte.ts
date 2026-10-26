import { etapeCompte, type EtatEtape } from "@/features/moteur/etapes";

import type { CompteCohorte } from "./api";

/**
 * Le tag d'étape d'un compte de cohorte, avec les données que Cohort tracking a
 * déjà : relevés du warm-up (le compte TikTok existe ?), Start warmup, premier
 * jour de posts. En cohorte, un compte désactivé a été arrêté : « Stopped ».
 */
export function etatCohorte(c: CompteCohorte, aujourdhui: string, maintenant: Date = new Date()): EtatEtape {
  const lu = [...c.releves].reverse().find((r) => r.existe !== null);
  return etapeCompte(
    {
      compteId: c.compte_id,
      isActive: c.is_active,
      arrete: !c.is_active,
      warmupStartedAt: c.warmup_lance_le,
      warmupEndsAt: c.warmup_fin,
      tiktokExiste: lu ? lu.existe : c.posts.some((p) => p.url) ? true : null,
      premierJour: c.premier_jour,
    },
    aujourdhui,
    maintenant,
  );
}
