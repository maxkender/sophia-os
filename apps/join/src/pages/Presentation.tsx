import { type MouseEvent, useEffect, useRef, useState } from "react";

import type { PaysPaie } from "../api";
import { estRtl, type T } from "../i18n";
import {
  decouperCorps, type LigneCorps, ligneTapee, longueurTape, mouvementReduit, NB_ECRANS, pasEcriture, texteTape,
} from "../presentation";
import { VideoGuide } from "../video";
import { VoirPaie } from "./Arrivee";

/** Les écrans qui portent un complément sous le texte (24/11) : la paie, les liens, la vidéo guide. */
const ECRAN_PAIE = 6;
const ECRAN_LIENS = 7;

/** Un pas d'écriture toutes les 30 ms (le nombre de caractères par pas : pasEcriture). */
const INTERVALLE = 30;

/**
 * La présentation avant le formulaire, façon appli mobile (24/11, Max) : 8 écrans plein cadre dont le texte
 * s'écrit progressivement, ligne après ligne (les lignes « 1. … » forment une vraie liste), une barre de progression,
 * « Continuer » et « Passer ». Les lecteurs d'écran lisent le texte complet (région aria-live polie), jamais les
 * lettres une à une ; avec prefers-reduced-motion, le texte s'affiche d'un coup.
 *
 * 25/11 (test persona) : l'écriture est 2 à 3 fois plus rapide (3 s au plus par écran) ; un tap sur le texte
 * l'affiche en entier ; le premier tap sur « Continuer » pendant l'écriture affiche tout le texte (le second passe à
 * l'écran suivant) ; la ligne en cours reste visible au-dessus du bouton collé en bas. Chaque écran a son entrée dans
 * l'historique (App) : le bouton « retour » du téléphone revient à l'écran d'avant.
 */
export default function Presentation({ t, langue, pays, etape, onEtape, onFini }: {
  t: T;
  langue: string;
  pays: PaysPaie[];
  etape: number;
  onEtape: (n: number) => void;
  onFini: () => void;
}) {
  const ecran = Math.min(Math.max(etape, 1), NB_ECRANS);
  const [n, setN] = useState(0);
  const [paie, setPaie] = useState(false);
  const [paysPaie, setPaysPaie] = useState("");
  const continuer = useRef<HTMLButtonElement>(null);
  const curseur = useRef<HTMLElement | null>(null);

  const titre = t(`onb.${ecran}.title`);
  const corps = t(`onb.${ecran}.body`);
  const total = longueurTape(titre, corps);
  const tape = texteTape(titre, corps, n);
  const dernier = ecran === NB_ECRANS;
  const blocs = decouperCorps(corps);
  const nCorps = Math.max(0, n - [...titre].length);
  /** Une ligne : sa place gardée (texte fantôme) et la partie déjà tapée, avec le curseur sur la ligne en cours. */
  const ligne = (l: LigneCorps) => {
    const tapee = ligneTapee(l, nCorps);
    const enCours = !tape.fini && nCorps >= l.debut && nCorps <= l.debut + [...l.texte].length;
    return (
      <span className="onb__pile">
        <span className="onb__fantome">{l.texte}</span>
        <span>{tapee}{enCours && tape.corps !== "" && <i className="onb__curseur" ref={(el) => { curseur.current = el; }} />}</span>
      </span>
    );
  };

  useEffect(() => {
    setPaie(false);
    if (mouvementReduit()) {
      setN(Number.POSITIVE_INFINITY);
      return;
    }
    setN(0);
    const pas = pasEcriture(total);
    const id = setInterval(() => setN((k) => {
      if (k >= total) clearInterval(id);
      return k + pas;
    }), INTERVALLE);
    return () => clearInterval(id);
  }, [ecran, total]);

  // La ligne en cours d'écriture reste visible au-dessus du bouton collé en bas (sur un petit écran).
  useEffect(() => {
    if (tape.fini) return;
    const el = curseur.current;
    if (!el) return;
    const bas = el.getBoundingClientRect().bottom;
    const barre = document.querySelector(".onb__bas")?.getBoundingClientRect().top ?? innerHeight;
    if (bas > barre - 12) globalThis.scrollBy({ top: bas - barre + 48, behavior: "auto" });
  }, [n, tape.fini]);

  /** Tout le texte d'un coup, puis la fin du texte amenée au-dessus du bouton si elle est cachée. */
  const toutAfficher = () => {
    setN(Number.POSITIVE_INFINITY);
    requestAnimationFrame(() => {
      const fin = document.querySelector(".onb__corps")?.getBoundingClientRect().bottom ?? 0;
      const barre = document.querySelector(".onb__bas")?.getBoundingClientRect().top ?? innerHeight;
      if (fin > barre) globalThis.scrollBy({ top: fin - barre + 16, behavior: "smooth" });
    });
  };

  const suivant = (ev: MouseEvent) => {
    ev.stopPropagation();
    // Premier tap pendant l'écriture : le texte en entier (rien n'est sauté sans avoir été lisible).
    if (!tape.fini) return toutAfficher();
    if (dernier) return onFini();
    onEtape(ecran + 1);
    continuer.current?.focus({ preventScroll: true });
  };

  return (
    // Un tap n'importe où pendant l'écriture affiche le texte en entier.
    <main className={`halo onb${dernier ? " onb--fin" : ""}${total > 420 ? " onb--long" : ""}`}
      onClick={() => !tape.fini && toutAfficher()}>
      <div className="wrap etroite onb__cadre">
        <div className="onb__haut">
          <div className="onb__barre" role="progressbar" aria-valuemin={1} aria-valuemax={NB_ECRANS} aria-valuenow={ecran}
            aria-label={t("onb.progress", { n: ecran, total: NB_ECRANS })}>
            {Array.from({ length: NB_ECRANS }, (_, i) => <span key={i} className={i < ecran ? "fait" : undefined} />)}
          </div>
          {!dernier && <button type="button" className="onb__passer" onClick={(e) => {
            e.stopPropagation();
            onFini();
          }}>{t("onb.skip")}</button>}
        </div>

        <div className="onb__corps" key={ecran}>
          <span className="label">{t("onb.label")} · {String(ecran).padStart(2, "0")}/{String(NB_ECRANS).padStart(2, "0")}</span>
          <div aria-live="polite" className="onb__textes">
            <h1 className="h2 onb__titre">
              <span className="sr">{titre}</span>
              <span className="onb__pile" aria-hidden="true">
                <span className="onb__fantome">{titre}</span>
                <span>{tape.titre}{!tape.fini && tape.corps === "" && <i className="onb__curseur" />}</span>
              </span>
            </h1>
            <div className="onb__texte">
              <span className="sr">{corps}</span>
              <div className="onb__lignes" aria-hidden="true">
                {blocs.map((b, i) => b.liste ? (
                  <ol key={i} className="onb__liste">{b.lignes.map((l) => <li key={l.debut} className={nCorps <= l.debut ? "onb__attente" : undefined}>{ligne(l)}</li>)}</ol>
                ) : <p key={i}>{ligne(b.ligne)}</p>)}
              </div>
            </div>
          </div>

          {ecran === ECRAN_PAIE && (
            <div className={`onb__plus${tape.fini ? " visible" : ""}`}>
              {paie ? (
                <div className="carte onb__paie"><VoirPaie t={t} langue={langue} pays={pays} valeur={paysPaie} onChoix={setPaysPaie} /></div>
              ) : (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPaie(true)}>
                  {t("onb.pay")}
                </button>
              )}
            </div>
          )}
          {ecran === ECRAN_LIENS && (
            <div className={`onb__plus${tape.fini ? " visible" : ""}`}>
              <div className="onb__liens">
                <a className="lien" href="/contract" target="_blank" rel="noopener">{t("faq.contract")}</a>
                <a className="lien" href="/faq" target="_blank" rel="noopener">{t("onb.faq")}</a>
              </div>
            </div>
          )}
          {/* 24/11 (Max) : la vidéo guide à la fin, au-dessus de « Postuler » (plus petite : le bouton reste visible). */}
          {dernier && (
            <div className={`onb__plus onb__video${tape.fini ? " visible" : ""}`}>
              <p>{t("onb.video")}</p>
              <VideoGuide t={t} />
            </div>
          )}
        </div>

        <div className="onb__bas">
          {ecran > 1 && (
            <button type="button" className="btn btn--ghost onb__retour" onClick={(e) => {
              e.stopPropagation();
              history.back();
            }} aria-label={t("onb.back")}>
              {estRtl(langue) ? "→" : "←"}
            </button>
          )}
          <button ref={continuer} type="button" className="btn onb__suite" onClick={suivant}>
            {dernier ? t("onb.apply") : t("onb.continue")}
          </button>
        </div>
      </div>
    </main>
  );
}
