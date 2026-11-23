import { useEffect, useState } from "react";

import { appeler } from "../api";
import { dateLongue, heureLimite, type T } from "../i18n";
import Etat from "./Etat";

export default function Decision({ t, langue, prenom, onContrat }: { t: T; langue: string; prenom: string; onContrat: () => void }) {
  const [r, setR] = useState<{ decision: "auto" | "a_traiter" | "refusee"; cohorte?: string; date_limite?: string } | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    appeler<{ decision: "auto" | "a_traiter" | "refusee"; cohorte?: string; date_limite?: string }>("decision")
      .then((x) => (x.ok ? setR(x) : setErreur(true)));
  }, []);

  if (erreur) return <Etat titre={t("err.title")} texte={t("err.generic")} />;
  if (!r) return <main className="page"><p className="wrap discret">…</p></main>;
  if (r.decision === "refusee") return <Etat titre={t("dec.refusedTitle", { name: prenom })} texte={t("dec.refused")} />;
  if (r.decision === "a_traiter") return <Etat titre={t("dec.waitTitle", { name: prenom })} texte={t("dec.wait")} />;
  const texte = r.cohorte && r.date_limite
    ? `${t("dec.ok")} ${t("dec.deadline", { limit: heureLimite(r.date_limite, langue), monday: dateLongue(r.cohorte, langue) })}`
    : t("dec.ok");
  return <Etat titre={t("dec.okTitle", { name: prenom })} texte={texte} action={{ texte: t("dec.read"), onClick: onContrat }} />;
}
