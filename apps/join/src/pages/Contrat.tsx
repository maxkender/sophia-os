import { useEffect, useState } from "react";

import { appeler, garderJeton } from "../api";
import { dateLongue, type T } from "../i18n";

type Infos = { version: string; resume: string[]; texte: string; email?: string; nom?: string; cohorte?: string | null };

const COULEURS = ["var(--violet)", "var(--cyan)", "var(--blue)", "var(--amber)", "var(--coral)"];

export default function Contrat({ t, langue, onSigne, onExpiree }: { t: T; langue: string; onSigne: () => void; onExpiree: () => void }) {
  const [c, setC] = useState<Infos | null>(null);
  const [ruul, setRuul] = useState("");
  const [nom, setNom] = useState("");
  const [signe, setSigne] = useState(false);
  const [champs, setChamps] = useState<string[]>([]);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    appeler<Infos>("contrat").then((r) => {
      if (!r.ok) return;
      setC(r);
      setRuul(r.email ?? "");
      setNom(r.nom ?? "");
    });
  }, []);

  async function signer() {
    setSigne(true);
    setErreur("");
    const r = await appeler<{ jeton: string; fields?: string[] }>("signer", { ruul_email: ruul, nom_legal: nom });
    setSigne(false);
    if (r.error === "expired") return onExpiree();
    if (!r.ok) {
      setChamps(r.fields ?? []);
      return setErreur(r.fields ? t("form.errors") : t("err.generic"));
    }
    garderJeton(r.jeton);
    onSigne();
  }

  if (!c) return <main className="page"><p className="wrap discret">…</p></main>;
  const lundi = c.cohorte ? dateLongue(c.cohorte, langue) : t("ctr.nextMonday");
  return (
    <main className="halo page">
      <div className="wrap etroite" style={{ display: "grid", gap: 18 }}>
        <div className="section__head" style={{ marginBottom: 0 }}>
          <span className="label">{t("ctr.label")}</span>
          <h1 className="h2">{t("ctr.title")}</h1>
          <p className="discret">{t("ctr.englishOnly")} ({c.version})</p>
        </div>

        <section className="carte" style={{ display: "grid", gap: 10 }}>
          <h2 className="h3">{t("ctr.summary")}</h2>
          <ul className="resume" lang="en">{c.resume.map((l) => <li key={l}><strong>{l}</strong></li>)}</ul>
        </section>

        <section style={{ display: "grid", gap: 10 }}>
          <h2 className="h3">{t("ctr.full")}</h2>
          <pre className="contrat" lang="en" tabIndex={0}>{c.texte}</pre>
        </section>

        <section className="carte" style={{ display: "grid", gap: 14 }}>
          <h2 className="h3">{t("ctr.after")}</h2>
          <ul className="apres">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n}><span style={{ background: COULEURS[n - 1] }}>{n}</span><p>{t(`ctr.a${n}`, { monday: lundi })}</p></li>
            ))}
          </ul>
        </section>

        <section className="carte formulaire">
          <label className="champ">{t("ctr.ruul")}
            <input type="email" inputMode="email" autoComplete="email" value={ruul} onChange={(e) => setRuul(e.target.value)}
              aria-invalid={champs.includes("ruul_email") || undefined} />
            <small>{t("ctr.ruulHelp")}</small>
          </label>
          <label className="champ">{t("ctr.legalName")}
            <input autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)}
              aria-invalid={champs.includes("nom_legal") || undefined} />
            <small>{t("ctr.legalNameHelp")}</small>
          </label>
          <p className="discret">{t("ctr.note")}</p>
          {erreur && <p className="erreur" role="alert">{erreur}</p>}
          <button type="button" className="btn btn--plein" disabled={signe || !ruul || !nom} onClick={signer}>
            {signe ? t("ctr.signing") : t("ctr.sign")}
          </button>
        </section>
      </div>
    </main>
  );
}
