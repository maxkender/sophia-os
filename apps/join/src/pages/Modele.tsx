import { useEffect, useState } from "react";

import { appeler, type PaysPaie } from "../api";
import type { T } from "../i18n";
import Societe from "../Societe";
import { VoirPaie } from "./Arrivee";

type Infos = { version: string; resume: string[]; texte: string };

/** Le contrat, public, AVANT de candidater : le texte signé (même version) et le tarif du pays choisi. */
export default function Modele({ t, langue, pays, onPostuler }: { t: T; langue: string; pays: PaysPaie[]; onPostuler: () => void }) {
  const [c, setC] = useState<Infos | null>(null);
  const [choix, setChoix] = useState("");

  useEffect(() => {
    appeler<Infos>("contrat").then((r) => r.ok && setC(r));
  }, []);

  return (
    <main className="halo page">
      <div className="wrap etroite" style={{ display: "grid", gap: 18 }}>
        <div className="section__head" style={{ marginBottom: 0 }}>
          <span className="label">{t("model.label")}</span>
          <h1 className="h2">{t("model.title")}</h1>
          <p className="lede">{t("model.lead")}</p>
          {c && <p className="discret">{t("ctr.englishOnly")} ({c.version})</p>}
        </div>

        <section className="carte"><Societe t={t} /></section>

        <section className="carte" style={{ display: "grid", gap: 10 }}>
          <h2 className="h3">{t("model.rateTitle")}</h2>
          <VoirPaie t={t} langue={langue} pays={pays} valeur={choix} onChoix={setChoix} />
        </section>

        {c ? (
          <>
            <section className="carte" style={{ display: "grid", gap: 10 }}>
              <h2 className="h3">{t("ctr.summary")}</h2>
              <ul className="resume" lang="en">{c.resume.map((l) => <li key={l}><strong>{l}</strong></li>)}</ul>
            </section>
            <section style={{ display: "grid", gap: 10 }}>
              <h2 className="h3">{t("ctr.full")}</h2>
              <pre className="contrat" lang="en" tabIndex={0}>{c.texte}</pre>
            </section>
          </>
        ) : <p className="discret">…</p>}

        <div><button type="button" className="btn" onClick={onPostuler}>{t("model.apply")}</button></div>
      </div>
    </main>
  );
}
