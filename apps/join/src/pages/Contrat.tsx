import { useEffect, useState } from "react";

import { appeler, garderJeton } from "../api";
import type { T } from "../i18n";

export default function Contrat({ t, onSigne }: { t: T; onSigne: () => void }) {
  const [c, setC] = useState<{ version: string; resume: string[]; texte: string } | null>(null);
  const [signe, setSigne] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    appeler<{ version: string; resume: string[]; texte: string }>("contrat").then((r) => r.ok && setC(r));
  }, []);

  async function signer() {
    setSigne(true);
    setErreur("");
    const r = await appeler<{ jeton: string }>("signer");
    setSigne(false);
    if (!r.ok) return setErreur(t("err.generic"));
    garderJeton(r.jeton);
    onSigne();
  }

  if (!c) return <main className="page etroite"><p className="discret">…</p></main>;
  return (
    <main className="page etroite">
      <h1>{t("ctr.title")}</h1>
      <p className="discret">{t("ctr.englishOnly")} ({c.version})</p>
      <h2>{t("ctr.summary")}</h2>
      <ul className="resume" lang="en">
        {c.resume.map((l) => <li key={l}><strong>{l}</strong></li>)}
      </ul>
      <h2>{t("ctr.full")}</h2>
      <pre className="contrat" lang="en" tabIndex={0}>{c.texte}</pre>
      <p className="discret">{t("ctr.note")}</p>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
      <button type="button" className="bouton principal" disabled={signe} onClick={signer}>{signe ? t("ctr.signing") : t("ctr.sign")}</button>
    </main>
  );
}
