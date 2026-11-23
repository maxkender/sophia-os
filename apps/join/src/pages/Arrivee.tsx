import { type ReactNode, useState } from "react";

import type { PaysPaie } from "../api";
import ChoixPays from "../ChoixPays";
import type { T } from "../i18n";
import Telephone from "../Telephone";

/** Le texte avec **gras** et ==surligné== (comme les textes du site Lovable). */
export function Riche({ texte }: { texte: string }) {
  const morceaux = texte.split(/(\*\*[^*]+\*\*|==[^=]+==)/g).filter(Boolean);
  return (
    <>
      {morceaux.map((m, i) => m.startsWith("**") ? <strong key={i}>{m.slice(2, -2)}</strong>
        : m.startsWith("==") ? <mark key={i}>{m.slice(2, -2)}</mark> : <span key={i}>{m}</span>)}
    </>
  );
}

export function VoirPaie({ t, langue, pays, valeur, onChoix }: {
  t: T;
  langue: string;
  pays: PaysPaie[];
  valeur: string;
  onChoix: (c: string) => void;
}) {
  const choisi = pays.find((p) => p.pays === valeur);
  return (
    <div className="paie">
      <label className="champ" htmlFor="pays-paie">{t("pay.choose")}</label>
      <ChoixPays id="pays-paie" t={t} langue={langue} pays={pays} valeur={valeur} onChoix={onChoix} />
      {valeur && (choisi?.tarif != null ? (
        <div aria-live="polite">
          <p className="paie__resultat">${choisi.tarif} <small>{t("pay.perWeekUnit")}</small></p>
          <p className="discret">{t("pay.resultNote")}</p>
        </div>
      ) : <p className="paie__vide" aria-live="polite">{t("pay.unavailable")}</p>)}
    </div>
  );
}

export default function Arrivee({ t, langue, pays, onPostuler, faq }: {
  t: T;
  langue: string;
  pays: PaysPaie[];
  onPostuler: () => void;
  faq?: ReactNode;
}) {
  const [paysPaie, setPaysPaie] = useState("");
  return (
    <main>
      <section className="halo hero">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <span className="label">{t("land.label")}</span>
            <h1 className="h1">{t("land.title1")} <em>{t("land.title2")}</em></h1>
            <p className="lede"><Riche texte={t("land.lead")} /></p>
            <span className="pilule"><i aria-hidden="true" />{t("land.noCamera")}</span>
            <div className="hero__cta">
              <button type="button" className="btn" onClick={onPostuler}>{t("land.cta")}</button>
              <a className="btn btn--ghost" href="#paie">{t("land.viewPay")}</a>
            </div>
          </div>
          <Telephone t={t} />
        </div>
        <div className="wrap">
          <dl className="stats">
            <div className="stat"><dt>2</dt><dd>{t("land.stat1")}</dd></div>
            <div className="stat"><dt>&lt; 10 min</dt><dd>{t("land.stat2")}</dd></div>
            <div className="stat"><dt>{t("land.stat3v")}</dt><dd>{t("land.stat3")}</dd></div>
          </dl>
        </div>
      </section>

      <section className="section" id="paie">
        <div className="wrap">
          <div className="grille" style={{ alignItems: "center" }}>
            <div className="section__head" style={{ marginBottom: 0 }}>
              <span className="label">{t("pay.label")}</span>
              <h2 className="h2">{t("pay.title")}</h2>
              <p className="lede">{t("pay.lead")}</p>
            </div>
            <div className="carte"><VoirPaie t={t} langue={langue} pays={pays} valeur={paysPaie} onChoix={setPaysPaie} /></div>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap">
          <div className="section__head">
            <span className="label">{t("do.label")}</span>
            <h2 className="h2">{t("do.title")}</h2>
          </div>
          <div className="grille">
            {[1, 2, 3, 4].map((n) => (
              <article key={n} className="carte tuile">
                <span className="tuile__num">0{n}</span>
                <h3 className="h3">{t(`do.${n}.title`)}</h3>
                <p><Riche texte={t(`do.${n}`)} /></p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grille" style={{ alignItems: "start" }}>
          <div className="section__head">
            <span className="label">{t("who.label")}</span>
            <h2 className="h2">{t("who.title")}</h2>
            <p className="lede"><Riche texte={t("who.lead")} /></p>
          </div>
          <div className="carte" style={{ display: "grid", gap: 16 }}>
            <p className="fort">{t("who.criteria")}</p>
            <ul className="liste-coches">
              {[1, 2, 3, 4, 5, 6].map((n) => <li key={n}>{t(`crit.${n}`)}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap">
          <div className="section__head">
            <span className="label">{t("why.label")}</span>
            <h2 className="h2">{t("why.title")}</h2>
          </div>
          <div className="grille">
            {[1, 2, 3].map((n) => (
              <article key={n} className="carte tuile">
                <h3 className="h3">{t(`why.${n}.title`)}</h3>
                <p><Riche texte={t(`why.${n}`)} /></p>
              </article>
            ))}
          </div>
          <p className="discret" style={{ marginTop: 18, maxWidth: "52rem" }}>{t("about.text")}</p>
        </div>
      </section>

      {faq}

      <section className="section">
        <div className="wrap">
          <div className="appel">
            <h2 className="h2">{t("cta.title")}</h2>
            <p className="lede">{t("cta.lead")}</p>
            <button type="button" className="btn" onClick={onPostuler}>{t("land.cta")}</button>
          </div>
        </div>
      </section>
    </main>
  );
}
