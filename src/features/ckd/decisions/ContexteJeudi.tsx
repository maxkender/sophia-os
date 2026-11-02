import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { type ContextePosteur, lireFil } from "./contexte";
import { ResumeContexte } from "./ResumeContexte";
import { type EvenementFil, resumer } from "./resumeContexte";

/**
 * Le jeudi : le contexte d'un posteur (le nudger, ou il est parti de lui-même ?).
 * La ligne vient du contexte de la semaine ; en dépliant, le fil complet
 * (10 derniers messages des deux côtés) est lu et le résumé recalculé.
 */
export function ContexteJeudi({ posterId, c }: { posterId: string; c?: ContextePosteur }) {
  const [ouvert, setOuvert] = React.useState(false);
  const fil = useQuery({ queryKey: ["posteur-fil", posterId], queryFn: () => lireFil(posterId), enabled: ouvert });
  const o = { stop: Boolean(c?.badges?.includes("stop")), absentJusquA: c?.absence?.fin ?? null };
  const evenements: EvenementFil[] = fil.data
    ? fil.data.map((m) => ({ sens: m.sens, at: m.at, canal: m.canal, texte: m.texte, cas: m.cas }))
    : [
      ...(c?.dernier_recu ? [{ sens: "recu" as const, at: c.dernier_recu.at, canal: c.dernier_recu.canal, texte: c.dernier_recu.texte }] : []),
      ...(c?.dernier_envoye ? [{ sens: "envoye" as const, at: c.dernier_envoye.at, canal: c.dernier_envoye.canal, texte: c.dernier_envoye.texte }] : []),
    ];
  return (
    <ResumeContexte
      r={c || fil.data ? resumer(evenements, o) : null}
      derniereConnexion={c?.derniere_connexion ?? null}
      dernierPost={c?.dernier_post_at ?? null}
      onOuvrir={() => setOuvert(true)}
      chargement={fil.isFetching}
    />
  );
}
