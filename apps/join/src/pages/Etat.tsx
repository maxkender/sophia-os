import { Marque } from "../Logo";

/** Un écran de message simple (pays fermé, offre expirée…). */
export default function Etat({ titre, texte, action }: {
  titre: string;
  texte: string;
  action?: { texte: string; onClick: () => void };
}) {
  return (
    <main className="halo">
      <div className="wrap etroite etat">
        <div className="marque-xl"><Marque /></div>
        <h1 className="h2">{titre}</h1>
        <p className="lede">{texte}</p>
        {action && <button type="button" className="btn" onClick={action.onClick}>{action.texte}</button>}
      </div>
    </main>
  );
}
