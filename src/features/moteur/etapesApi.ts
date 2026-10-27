import { supabase } from "@/lib/supabase/client";

import type { Qualite } from "./etapes";

/** Ce que seule la base sait pour l'étape d'un compte (0363). */
export interface DonneesEtape {
  tiktokExiste: boolean | null;
  premierJour: string | null;
  dernierPublie: string | null;
  arrete: boolean;
  qualite: Qualite | null;
}

/** Par compte. La base ne rend à une HM que les comptes de ses posteurs. */
export async function lireEtapesComptes(): Promise<Map<string, DonneesEtape>> {
  const { data, error } = await supabase.rpc("etapes_comptes");
  if (error) throw error;
  type Ligne = {
    compte_id: string;
    tiktok_existe: boolean | null;
    premier_jour: string | null;
    dernier_publie: string | null;
    arrete: boolean | null;
    qualite: Qualite | null;
  };
  return new Map(
    ((data ?? []) as Ligne[]).map((l) => [
      l.compte_id,
      {
        tiktokExiste: l.tiktok_existe,
        premierJour: l.premier_jour,
        dernierPublie: l.dernier_publie,
        arrete: Boolean(l.arrete),
        qualite: l.qualite,
      },
    ]),
  );
}
