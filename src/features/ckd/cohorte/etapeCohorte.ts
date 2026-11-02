import { etapeCompte, type EtatEtape } from "@/features/moteur/etapes";
import { lundiDe } from "@/features/moteur/semaines";
import { ajouterJours } from "@/features/onboarding/datesRuul";

import type { CompteCohorte } from "./api";

/**
 * Le tag d'étape d'un compte de cohorte, avec les données que Cohort tracking a
 * déjà : relevés du warm-up (le compte TikTok existe ?), Start warmup, premier
 * jour de posts. En cohorte, un compte désactivé a été arrêté : « Stopped ».
 */
export function etatCohorte(c: CompteCohorte, aujourdhui: string, maintenant: Date = new Date()): EtatEtape {
  const lu = [...c.releves].reverse().find((r) => r.existe !== null);
  const publies = c.posts.filter((p) => p.url).map((p) => p.jour).sort();
  // Les posts lus sont ceux de la semaine de la cohorte : le dernier post n'est
  // connu en entier que pendant cette semaine-là.
  const semaineEnCours =
    c.premier_jour !== null && aujourdhui <= ajouterJours(lundiDe(c.premier_jour), 6);
  return etapeCompte(
    {
      compteId: c.compte_id,
      isActive: c.is_active,
      arrete: !c.is_active,
      warmupStartedAt: c.warmup_lance_le,
      warmupEndsAt: c.warmup_fin,
      tiktokExiste: publies.length > 0 ? true : lu ? lu.existe : null,
      premierJour: c.premier_jour,
      dernierPublie: semaineEnCours ? (publies[publies.length - 1] ?? null) : undefined,
    },
    aujourdhui,
    maintenant,
  );
}
