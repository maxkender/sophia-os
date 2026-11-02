import * as React from "react";

import { BonusAVenir } from "@/features/bonus/BonusAVenir";
import { ChoixHm } from "@/features/ckd/vueHm/ChoixHm";
import { PagePaie } from "@/features/paie/PagePaie";

/**
 * Admin → Paie : la liste de paie du lundi (v3, 0380), puis les bonus à venir
 * par HM (avant dans Paiements de la vue HM du Head of Ops, retiré du menu au
 * prompt 15).
 */
export function AdminPaiePage() {
  const [hm, setHm] = React.useState("");
  return (
    <PagePaie
      apres={
        <div className="space-y-3">
          <ChoixHm valeur={hm} onChange={setHm} />
          <BonusAVenir hm={hm} />
        </div>
      }
    />
  );
}
