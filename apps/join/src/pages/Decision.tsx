import { useEffect, useState } from "react";

import { appeler } from "../api";
import { jourMois, limiteLocale, type T } from "../i18n";
import { VIDEO_GUIDE_URL } from "../video";
import Etat from "./Etat";

type Reponse = { decision: "auto" | "a_traiter" | "refusee"; cohorte?: string; date_limite?: string };

/**
 * La décision après les codes, et l'écran d'un candidat qui revient. 25/11 (test persona) : un message pendant la
 * vérification (plus de « … ») ; « sous 48 h » dit par où arrive la réponse et quoi faire en attendant ; acceptée :
 * « Tu es accepté·e » et la date limite à l'heure du candidat (minuit, heure de Paris), avant le contrat.
 */
export default function Decision({ t, langue, prenom, onContrat, onFaq }: {
  t: T;
  langue: string;
  prenom: string;
  onContrat: () => void;
  onFaq: () => void;
}) {
  const [r, setR] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    appeler<Reponse>("decision").then((x) => (x.ok ? setR(x) : setErreur(true)));
  }, []);

  if (erreur) return <Etat titre={t("err.title")} texte={t("err.generic")} />;
  if (!r) return <Etat titre={t("dec.checking")} chargement />;
  if (r.decision === "refusee") return <Etat titre={t("dec.refusedTitle", { name: prenom })} texte={t("dec.refused")} />;
  if (r.decision === "a_traiter") {
    return (
      <Etat titre={t("dec.waitTitle", { name: prenom })} texte={t("dec.wait")} liens={
        <>
          <a className="btn btn--ghost btn--sm" href={VIDEO_GUIDE_URL} target="_blank" rel="noopener noreferrer">{t("video.watch")}</a>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onFaq}>{t("onb.faq")}</button>
        </>
      } />
    );
  }
  return (
    <Etat titre={t("dec.okTitle", { name: prenom })} texte={t("dec.ok")}
      encadre={r.cohorte && r.date_limite
        ? t("dec.deadline", { limit: limiteLocale(r.date_limite, langue), monday: jourMois(r.cohorte, langue) })
        : undefined}
      action={{ texte: t("dec.read"), onClick: onContrat }} />
  );
}
