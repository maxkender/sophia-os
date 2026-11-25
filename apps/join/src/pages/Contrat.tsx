import { useEffect, useRef, useState } from "react";

import { appeler, garderJeton } from "../api";
import { texteSigne } from "../contrat";
import { jourMois, type T } from "../i18n";
import Societe, { ResumeTraduit } from "../Societe";
import Etat from "./Etat";

type Infos = { version: string; resume: string[]; texte: string; email?: string; nom?: string; cohorte?: string | null };

const COULEURS = ["var(--violet)", "var(--cyan)", "var(--blue)", "var(--amber)", "var(--coral)"];

/**
 * Le contrat à signer. 25/11 (test persona) : le résumé dans la langue du candidat (traduction d'affichage), le texte
 * complet signé en anglais tel quel (résumé anglais compris), l'identité de la société en bas et sans gras ; après
 * « Signer », un écran d'attente jusqu'à la page perso (plus de contrat qui réapparaît avec le bouton actif).
 */
export default function Contrat({ t, langue, onSigne, onExpiree }: { t: T; langue: string; onSigne: () => void; onExpiree: () => void }) {
  const [c, setC] = useState<Infos | null>(null);
  const [ruul, setRuul] = useState("");
  const [nom, setNom] = useState("");
  const [signe, setSigne] = useState(false);
  const [fini, setFini] = useState(false);
  const [champs, setChamps] = useState<string[]>([]);
  const [erreur, setErreur] = useState("");
  const enCours = useRef(false);

  useEffect(() => {
    appeler<Infos>("contrat").then((r) => {
      if (!r.ok) return;
      setC(r);
      setRuul(r.email ?? "");
      setNom(r.nom ?? "");
    });
  }, []);

  async function signer() {
    // Un double tap n'envoie qu'une signature.
    if (enCours.current) return;
    enCours.current = true;
    setSigne(true);
    setErreur("");
    const r = await appeler<{ jeton: string; fields?: string[] }>("signer", { ruul_email: ruul, nom_legal: nom });
    if (r.ok) {
      garderJeton(r.jeton);
      // L'écran d'attente reste jusqu'à l'affichage de la page perso (App change d'écran quand `moi` est là).
      setFini(true);
      onSigne();
      return;
    }
    enCours.current = false;
    setSigne(false);
    if (r.error === "expired") return onExpiree();
    setChamps(r.fields ?? []);
    setErreur(r.fields ? t("form.errors") : t("err.generic"));
  }

  if (fini) return <Etat titre={t("ctr.signed")} chargement />;
  if (!c) return <Etat titre={t("ctr.title")} chargement />;
  const items = c.cohorte ? [1, 2, 3, 4, 5] : [2, 3, 4, 5];
  return (
    <main className="halo page">
      <div className="wrap etroite" style={{ display: "grid", gap: 18 }}>
        <div className="section__head" style={{ marginBottom: 0 }}>
          <span className="label">{t("ctr.label")}</span>
          <h1 className="h2">{t("ctr.title")}</h1>
          <p className="discret">{t("ctr.englishOnly")} ({c.version})</p>
        </div>

        <ResumeTraduit t={t} langue={langue} />

        <section style={{ display: "grid", gap: 10 }}>
          <h2 className="h3">{t("ctr.full")}</h2>
          <pre className="contrat" lang="en" tabIndex={0}>{texteSigne(c)}</pre>
        </section>

        <section className="carte" style={{ display: "grid", gap: 14 }}>
          <h2 className="h3">{t("ctr.after")}</h2>
          <ul className="apres">
            {items.map((n, i) => (
              <li key={n}><span style={{ background: COULEURS[i] }}>{i + 1}</span><p>{t(`ctr.a${n}`, { monday: c.cohorte ? jourMois(c.cohorte, langue) : "" })}</p></li>
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

        <Societe t={t} />
      </div>
    </main>
  );
}
