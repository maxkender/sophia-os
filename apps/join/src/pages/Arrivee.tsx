import { type ReactNode, useState } from "react";

import type { PaysPaie } from "../api";
import ChoixPays from "../ChoixPays";
import type { T } from "../i18n";
import { VideoGuide } from "../video";

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

/** L'accueil, concis (23/11, Max) : un titre, 3 points clés (le job, la paie, les étapes), le bouton, la FAQ. */
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
      <section className="halo hero hero--court">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <span className="label">{t("land.label")}</span>
            <h1 className="h1">{t("land.title1")} <em>{t("land.title2")}</em></h1>
            <p className="lede">{t("land.lead")}</p>
            {/* 25/11 (Max) : qui est Vik Studios (« Sophia » apparaît dans le contrat et sur Slack). */}
            <p className="hero__apropos">{t("land.about")}</p>
            <div className="hero__cta">
              <button type="button" className="btn" onClick={onPostuler}>{t("land.cta")}</button>
            </div>
          </div>
          {/* 23/11 (Max) : la vidéo guide en haut, à droite du titre (en dessous sur téléphone) ; 25/11 : un aperçu, la
              vidéo ne se charge qu'au clic. */}
          <div className="video video--hero">
            <VideoGuide t={t} />
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap grille points">
          <article className="carte tuile">
            <span className="tuile__num">01</span>
            <h2 className="h3">{t("key.job.title")}</h2>
            <p>{t("key.job")}</p>
          </article>
          <article className="carte tuile" id="paie">
            <span className="tuile__num">02</span>
            <h2 className="h3">{t("key.pay.title")}</h2>
            <p>{t("key.pay")}</p>
            <VoirPaie t={t} langue={langue} pays={pays} valeur={paysPaie} onChoix={setPaysPaie} />
          </article>
          <article className="carte tuile">
            <span className="tuile__num">03</span>
            <h2 className="h3">{t("key.steps.title")}</h2>
            <ol className="etapes-courtes">{[1, 2, 3, 4].map((n) => <li key={n}>{t(`key.steps.${n}`)}</li>)}</ol>
          </article>
        </div>
        <div className="wrap centre" style={{ marginTop: 24 }}>
          <button type="button" className="btn" onClick={onPostuler}>{t("land.cta")}</button>
        </div>
      </section>

      {faq}
    </main>
  );
}
