import * as React from "react";

import { CalendrierSemaine } from "@/features/ckd/calendrier/CalendrierSemaine";
import { AnciensPosteurs } from "@/features/ckd/anciens/AnciensPosteurs";
import { SemaineProchaine } from "@/features/ckd/semaineProchaine/SemaineProchaine";

import { ChoixHm } from "./ChoixHm";

/**
 * Check, Kill or Double → Vue HM : les blocs du dashboard des HMs (Cette
 * semaine, Semaine prochaine, Anciens posteurs), avec le choix de la HM.
 */
export function VueHm() {
  const [hm, setHm] = React.useState("");
  return (
    <div className="space-y-6">
      <ChoixHm valeur={hm} onChange={setHm} />
      <CalendrierSemaine hm={hm} />
      <SemaineProchaine hm={hm} />
      <AnciensPosteurs hm={hm} />
    </div>
  );
}
