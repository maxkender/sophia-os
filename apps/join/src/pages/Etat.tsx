import type { ReactNode } from "react";

import { Marque } from "../Logo";

/** Un écran de message simple (pays fermé, offre expirée, attente…). */
export default function Etat({ titre, texte, action, encadre, liens, chargement }: {
  titre: string;
  texte?: string;
  action?: { texte: string; onClick: () => void };
  /** Une information mise en avant sous le texte (la date limite). */
  encadre?: ReactNode;
  /** Des liens secondaires (la vidéo, la FAQ). */
  liens?: ReactNode;
  /** 25/11 : un écran d'attente (le logo tourne doucement), lu par les lecteurs d'écran. */
  chargement?: boolean;
}) {
  return (
    <main className="halo">
      <div className="wrap etroite etat" role={chargement ? "status" : undefined} aria-busy={chargement || undefined}>
        <div className={`marque-xl${chargement ? " marque-xl--attente" : ""}`}><Marque /></div>
        <h1 className="h2">{titre}</h1>
        {texte && <p className="lede">{texte}</p>}
        {encadre && <div className="etat__encadre">{encadre}</div>}
        {action && <button type="button" className="btn" onClick={action.onClick}>{action.texte}</button>}
        {liens && <div className="etat__liens">{liens}</div>}
      </div>
    </main>
  );
}
