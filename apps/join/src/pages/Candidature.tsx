import { useState, type FormEvent } from "react";

import { appeler, garderJeton, lireSource, type PaysPaie } from "../api";
import ChoixPays from "../ChoixPays";
import type { T } from "../i18n";
import { formatInternational, INDICATIFS } from "../indicatifs";
import { VoirPaie } from "./Arrivee";

export interface Envoi {
  prenom: string;
  email: string;
  whatsapp: string;
  ferme?: boolean;
  codes_test?: { email?: string; whatsapp?: string };
}

const ENTENDU = ["ad", "referral", "sophia_app", "other", "none"] as const;

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

export default function Candidature({ t, langue, pays, onEnvoye, onLegal }: {
  t: T;
  langue: string;
  pays: PaysPaie[];
  onEnvoye: (e: Envoi) => void;
  onLegal: () => void;
}) {
  const [v, setV] = useState({ prenom: "", nom: "", email: "", indicatif: "33", tel: "", pays: "", parrain: "", site: "" });
  const [majeur, setMajeur] = useState<boolean | null>(null);
  const [deux, setDeux] = useState<boolean | null>(null);
  const [entendu, setEntendu] = useState("");
  const [cases, setCases] = useState({ tarif: false, engagement: false, consentement: false, whatsapp: false });
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState("");

  const indicatifs = [...new Set(Object.values(INDICATIFS))].sort((a, b) => Number(a) - Number(b));
  const inv = (k: string) => erreurs.includes(k) || undefined;
  const champ = (k: "prenom" | "nom" | "email" | "tel" | "parrain") => ({
    value: v[k],
    onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }),
    "aria-invalid": inv(k === "tel" ? "whatsapp" : k),
  });
  const caseA = (k: keyof typeof cases, nomErreur: string) => ({
    checked: cases[k],
    onChange: (e: { target: { checked: boolean } }) => setCases({ ...cases, [k]: e.target.checked }),
    "aria-invalid": inv(nomErreur),
  });

  const choisirPays = (c: string) => setV({ ...v, pays: c, indicatif: v.tel ? v.indicatif : (INDICATIFS[c] ?? v.indicatif) });
  const paysOuvert = pays.some((p) => p.pays === v.pays);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if (majeur === false) {
      setErreurs(["majeur"]);
      return setMessage(t("form.underage"));
    }
    setEnvoi(true);
    const whatsapp = formatInternational(v.indicatif, v.tel);
    const r = await appeler<{ jeton?: string; ferme?: boolean; codes_test?: Envoi["codes_test"]; fields?: string[] }>("candidater", {
      prenom: v.prenom, nom: v.nom, email: v.email, whatsapp, pays: v.pays, majeur: majeur === true,
      deux_telephones: deux, entendu, parrain: entendu === "referral" ? v.parrain : "",
      accord_tarif: cases.tarif, engagement: cases.engagement, consentement: cases.consentement, whatsapp_optin: cases.whatsapp,
      langue, site: v.site, source: lireSource(),
    });
    setEnvoi(false);
    if (!r.ok) {
      setErreurs(r.fields ?? []);
      setMessage(r.error === "rate" ? t("form.rate") : r.fields ? t("form.errors") : r.error === "network" ? t("err.network") : t("err.generic"));
      return;
    }
    garderJeton(r.jeton ?? null);
    onEnvoye({ prenom: v.prenom, email: v.email, whatsapp, ferme: r.ferme, codes_test: r.codes_test });
  }

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
            <label>Website<input tabIndex={-1} autoComplete="off" value={v.site} onChange={(e) => setV({ ...v, site: e.target.value })} /></label>
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
              <select value={v.indicatif} onChange={(e) => setV({ ...v, indicatif: e.target.value })} aria-label={t("form.dialCode")}>
                {indicatifs.map((i) => <option key={i} value={i}>+{i}</option>)}
              </select>
              <input type="tel" inputMode="tel" autoComplete="tel-national" {...champ("tel")} />
            </div>
            <small>{t("form.whatsappHelp")}</small>
          </label>
          <label className="case"><input type="checkbox" {...caseA("whatsapp", "whatsapp_optin")} /><span>{t("form.whatsappOptin")}</span></label>
          <OuiNon t={t} legende={t("form.adult")} valeur={majeur} onChoix={setMajeur} invalide={inv("majeur")} />
          {majeur === false && <p className="erreur" role="alert">{t("form.underage")}</p>}
          <div className="groupe">
            <OuiNon t={t} legende={t("form.twoPhones")} valeur={deux} onChoix={setDeux} invalide={inv("deux_telephones")} />
            <small className="aide">{t("form.twoPhonesHelp")}</small>
          </div>
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
          <label className="case"><input type="checkbox" {...caseA("tarif", "accord_tarif")} /><span>{t("form.agreePay")}</span></label>
          <label className="case"><input type="checkbox" {...caseA("engagement", "engagement")} /><span>{t("form.commit")}</span></label>
          <p className="discret">{t("form.commitWarning")}</p>
          <label className="case">
            <input type="checkbox" {...caseA("consentement", "consentement")} />
            <span>{t("form.consent")} <button type="button" className="lien" onClick={onLegal}>{t("form.privacy")}</button></span>
          </label>

          {message && <p className="erreur" role="alert">{message}</p>}
          <button type="submit" className="btn btn--plein" disabled={envoi}>{envoi ? t("form.sending") : t("form.submit")}</button>
        </form>
      </div>
    </main>
  );
}
