import * as React from "react";

import { useAuth } from "@/features/auth/AuthContext";
import { BonusAVenir } from "@/features/bonus/BonusAVenir";
import { ChoixHm } from "@/features/ckd/vueHm/ChoixHm";
import { PagePaie } from "@/features/paie/PagePaie";

/**
 * Paiements de la vue HM, réservée au Head of Ops (Lucia) : la liste de paie
 * du lundi, la même que dans Admin → Paie (v3, 0380), puis les bonus à venir
 * par HM.
 */
export function HiringPaiementsPage() {
  const { role } = useAuth();
  // Le Head of Ops choisit la HM des bonus à venir.
  const [hm, setHm] = React.useState("");
  return (
    <PagePaie
      apres={
        <div className="space-y-3">
          {role === "head_of_ops" && <ChoixHm valeur={hm} onChange={setHm} />}
          <BonusAVenir hm={hm} />
        </div>
      }
    />
  );
}
