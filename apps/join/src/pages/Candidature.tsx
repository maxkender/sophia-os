import { useEffect, useState, type FormEvent } from "react";

import { appeler, garderJeton, lireSource, type PaysPaie } from "../api";
import { type Cases, type Champs, effacerBrouillon, garderBrouillon, lireBrouillon } from "../brouillon";
import ChoixPays from "../ChoixPays";
import type { T } from "../i18n";
import { formatInternational, INDICATIFS, indicatifDuNavigateur } from "../indicatifs";
import { VoirPaie } from "./Arrivee";

export interface Envoi {
  prenom: string;
  email: string;
  whatsapp: string;
  ferme?: boolean;
  codes_test?: { email?: string; whatsapp?: string };
  /** 25/11 : faux quand le code WhatsApp n'est pas demandé (code par email seulement). */
  whatsapp_code?: boolean;
}

const ENTENDU = ["ad", "referral", "sophia_app", "other", "none"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function OuiNon({ t, legende, valeur, onChoix, invalide }: {
  t: T;
  legende: string;
  valeur: boolean | null;
  onChoix: (v: boolean) => void;
  invalide?: boolean;
}) {
  return (
    <fieldset aria-invalid={invalide || undefined}>
      <legend>{legende}</legend>
      <div className="choix">
        <button type="button" aria-pressed={valeur === true} onClick={() => onChoix(true)}>{t("form.yes")}</button>
        <button type="button" aria-pressed={valeur === false} onClick={() => onChoix(false)}>{t("form.no")}</button>
      </div>
    </fieldset>
  );
}

/**
 * Le formulaire. 25/11 (Max) : plus de question « deux téléphones » ; les liens (contrat, confidentialité) s'ouvrent
 * dans un nouvel onglet ; une erreur disparaît dès que son champ est corrigé, les cases obligatoires non cochées sont
 * en rouge ; l'indicatif suit le pays choisi (et, au départ, la région du navigateur : jamais +33 par défaut).
 */
export default function Candidature({ t, langue, pays, onEnvoye }: {
  t: T;
  langue: string;
  pays: PaysPaie[];
  onEnvoye: (e: Envoi) => void;
}) {
  const [depart] = useState(lireBrouillon);
  const [v, setV] = useState<Champs>(depart?.v ?? {
    prenom: "", nom: "", email: "", indicatif: indicatifDuNavigateur(navigator.languages ?? [navigator.language]), tel: "", pays: "", parrain: "",
  });
  const [site, setSite] = useState("");
  const [majeur, setMajeur] = useState<boolean | null>(depart?.majeur ?? null);
  const [entendu, setEntendu] = useState(depart?.entendu ?? "");
  const [cases, setCases] = useState<Cases>(depart?.cases ?? { tarif: false, engagement: false, consentement: false, whatsapp: false });
  const [indicatifManuel, setIndicatifManuel] = useState(depart?.indicatifManuel ?? false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [tente, setTente] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    garderBrouillon({ v, majeur, entendu, cases, indicatifManuel });
  }, [v, majeur, entendu, cases, indicatifManuel]);

  /** Ce qui manque ou est faux (les mêmes règles que le serveur, validerCandidature). */
  const manques = (): string[] => {
    const m: string[] = [];
    if (!v.prenom.trim()) m.push("prenom");
    if (!v.nom.trim()) m.push("nom");
    if (!EMAIL.test(v.email.trim())) m.push("email");
    if (!v.pays) m.push("pays");
    const libre = /^\s*(\+|00)/.test(v.tel);
    if ((!v.indicatif && !libre) || !/^\+[1-9]\d{7,14}$/.test(formatInternational(v.indicatif, v.tel))) m.push("whatsapp");
    if (majeur !== true) m.push("majeur");
    if (!entendu) m.push("entendu");
    if (entendu === "referral" && !v.parrain.trim()) m.push("parrain");
    if (!cases.tarif) m.push("accord_tarif");
    if (!cases.engagement) m.push("engagement");
    if (!cases.consentement) m.push("consentement");
    return m;
  };

  // Après un premier envoi refusé, les erreurs suivent la saisie : un champ corrigé n'est plus en rouge.
  useEffect(() => {
    if (!tente) return;
    const m = manques();
    setErreurs(m);
    if (!m.length) setMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tente, v, majeur, entendu, cases]);

  const indicatifs = [...new Set(Object.values(INDICATIFS))].sort((a, b) => Number(a) - Number(b));
  const inv = (k: string) => erreurs.includes(k) || undefined;
  const champ = (k: "prenom" | "nom" | "email" | "tel" | "parrain") => ({
    value: v[k],
    onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }),
    "aria-invalid": inv(k === "tel" ? "whatsapp" : k),
  });
  const caseA = (k: keyof Cases, nomErreur: string) => ({
    label: { className: `case${inv(nomErreur) ? " case--erreur" : ""}` },
    input: {
      type: "checkbox" as const,
      checked: cases[k],
      onChange: (e: { target: { checked: boolean } }) => setCases({ ...cases, [k]: e.target.checked }),
      "aria-invalid": inv(nomErreur),
    },
  });

  /** Le pays choisi donne l'indicatif, sauf si la personne en a choisi un elle-même. */
  const choisirPays = (c: string) => setV({ ...v, pays: c, indicatif: indicatifManuel ? v.indicatif : (INDICATIFS[c] ?? v.indicatif) });
  const paysOuvert = pays.some((p) => p.pays === v.pays);

  const montrerErreur = () => requestAnimationFrame(() => {
    document.querySelector<HTMLElement>("form [aria-invalid='true'], form .case--erreur")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setTente(true);
    if (majeur === false) {
      setErreurs(["majeur"]);
      setMessage(t("form.underage"));
      return montrerErreur();
    }
    const m = manques();
    if (m.length) {
      setErreurs(m);
      setMessage(t("form.errors"));
      return montrerErreur();
    }
    setEnvoi(true);
    const whatsapp = formatInternational(v.indicatif, v.tel);
    const r = await appeler<{ jeton?: string; ferme?: boolean; codes_test?: Envoi["codes_test"]; whatsapp_code?: boolean; fields?: string[] }>("candidater", {
      prenom: v.prenom, nom: v.nom, email: v.email, whatsapp, pays: v.pays, majeur: majeur === true,
      entendu, parrain: entendu === "referral" ? v.parrain : "",
      accord_tarif: cases.tarif, engagement: cases.engagement, consentement: cases.consentement, whatsapp_optin: cases.whatsapp,
      langue, site, source: lireSource(),
    });
    setEnvoi(false);
    if (!r.ok) {
      setErreurs(r.fields ?? []);
      setMessage(r.error === "rate" ? t("form.rate") : r.fields ? t("form.errors") : r.error === "network" ? t("err.network") : t("err.generic"));
      if (r.fields?.length) montrerErreur();
      return;
    }
    effacerBrouillon();
    garderJeton(r.jeton ?? null);
    onEnvoye({ prenom: v.prenom, email: v.email, whatsapp, ferme: r.ferme, codes_test: r.codes_test, whatsapp_code: r.whatsapp_code });
  }

  const tarif = caseA("tarif", "accord_tarif");
  const engagement = caseA("engagement", "engagement");
  const consentement = caseA("consentement", "consentement");
  const optin = caseA("whatsapp", "whatsapp_optin");
  return (
    <main className="halo page">
      <div className="wrap etroite">
        <div className="section__head">
          <span className="label">{t("form.label")}</span>
          <h1 className="h2">{t("form.title")}</h1>
          <p className="lede">{t("form.lead")}</p>
        </div>
        <form className="carte formulaire" onSubmit={envoyer} noValidate>
          <div className="piege" aria-hidden="true">
            <label>Website<input tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} /></label>
          </div>

          <p className="groupe__titre">{t("form.aboutYou")}</p>
          <div className="deux">
            <label className="champ">{t("form.firstName")}<input autoComplete="given-name" required {...champ("prenom")} /></label>
            <label className="champ">{t("form.lastName")}<input autoComplete="family-name" required {...champ("nom")} /></label>
          </div>
          <label className="champ">{t("form.email")}
            <input type="email" inputMode="email" autoComplete="email" required {...champ("email")} />
            <small>{t("form.emailExample")}</small>
          </label>
          <div className="champ">
            <label htmlFor="pays-form">{t("form.country")}</label>
            <ChoixPays id="pays-form" t={t} langue={langue} pays={pays} valeur={v.pays} onChoix={choisirPays} invalide={inv("pays")} />
          </div>
          <label className="champ">{t("form.whatsapp")}
            <div className="rangee">
              <select value={v.indicatif} aria-label={t("form.dialCode")} aria-invalid={inv("whatsapp")} onChange={(e) => {
                setIndicatifManuel(true);
                setV({ ...v, indicatif: e.target.value });
              }}>
                <option value="">+…</option>
                {indicatifs.map((i) => <option key={i} value={i}>+{i}</option>)}
              </select>
              <input type="tel" inputMode="tel" autoComplete="tel-national" required {...champ("tel")} />
            </div>
            <small>{t("form.whatsappHelp")}</small>
          </label>
          <label {...optin.label}><input {...optin.input} /><span>{t("form.whatsappOptin")}</span></label>
          <OuiNon t={t} legende={t("form.adult")} valeur={majeur} onChoix={setMajeur} invalide={inv("majeur")} />
          {majeur === false && <p className="erreur" role="alert">{t("form.underage")}</p>}
          <label className="champ">{t("form.heard")}
            <select value={entendu} onChange={(e) => setEntendu(e.target.value)} aria-invalid={inv("entendu")}>
              <option value="">{t("form.choose")}</option>
              {ENTENDU.map((k) => <option key={k} value={k}>{t(`heard.${k}`)}</option>)}
            </select>
          </label>
          {entendu === "referral" && (
            <label className="champ">{t("form.referralName")}<input autoComplete="off" {...champ("parrain")} /></label>
          )}

          <p className="groupe__titre">{t("form.payCheck")}</p>
          {v.pays ? (
            paysOuvert ? (
              <div className="encadre">
                <VoirPaie t={t} langue={langue} pays={pays} valeur={v.pays} onChoix={choisirPays} />
                <p className="discret">{t("form.payWarning")}</p>
              </div>
            ) : <div className="encadre encadre--alerte"><p>{t("form.closedNote")}</p></div>
          ) : <p className="discret">{t("form.payFirst")}</p>}
          <label {...tarif.label}><input {...tarif.input} /><span>{t("form.agreePay")}</span></label>
          <label {...engagement.label}><input {...engagement.input} /><span>{t("form.commit")}</span></label>
          <p className="discret">{t("form.commitWarning")}</p>
          <p><a className="lien" href="/contract" target="_blank" rel="noopener">{t("form.readContract")}</a></p>
          <label {...consentement.label}>
            <input {...consentement.input} />
            <span>{t("form.consent")} <a className="lien" href="/privacy" target="_blank" rel="noopener">{t("form.privacy")}</a></span>
          </label>

          {message && <p className="erreur" role="alert">{message}</p>}
          <button type="submit" className="btn btn--plein" disabled={envoi}>{envoi ? t("form.sending") : t("form.submit")}</button>
        </form>
      </div>
    </main>
  );
}
