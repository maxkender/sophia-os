import { useEffect, useState } from "react";

import { appeler } from "../api";
import type { T } from "../i18n";

export default function Decision({ t, prenom, onContrat }: { t: T; prenom: string; onContrat: () => void }) {
  const [decision, setDecision] = useState<"auto" | "a_traiter" | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    appeler<{ decision: "auto" | "a_traiter" }>("decision").then((r) => (r.ok ? setDecision(r.decision) : setErreur(true)));
  }, []);

  if (erreur) return <main className="page etroite"><p className="erreur">{t("err.generic")}</p></main>;
  if (!decision) return <main className="page etroite"><p className="discret">…</p></main>;
  if (decision === "a_traiter") {
    return (
      <main className="page etroite centre">
        <h1>{t("dec.waitTitle", { name: prenom })}</h1>
        <p className="sous-titre">{t("dec.wait")}</p>
      </main>
    );
  }
  return (
    <main className="page etroite centre">
      <h1>{t("dec.okTitle", { name: prenom })}</h1>
      <p className="sous-titre">{t("dec.ok")}</p>
      <button type="button" className="bouton principal" onClick={onContrat}>{t("dec.read")}</button>
    </main>
  );
}
