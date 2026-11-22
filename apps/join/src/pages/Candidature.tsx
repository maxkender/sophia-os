import { useState, type FormEvent } from "react";

import { appeler, garderJeton, type PaysPaie } from "../api";
import { nomPays, type T } from "../i18n";
import { formatInternational, INDICATIFS } from "../indicatifs";

export interface Envoi {
  prenom: string;
  email: string;
  whatsapp: string;
  codes_test?: { email?: string; whatsapp?: string };
}

const QUESTIONS = ["pays_actuel", "heures", "tiktok", "contenu"] as const;

export default function Candidature({ t, langue, pays, onEnvoye }: {
  t: T;
  langue: string;
  pays: PaysPaie[];
  onEnvoye: (e: Envoi) => void;
}) {
  const [v, setV] = useState({ prenom: "", nom: "", email: "", indicatif: "33", tel: "", pays: "", age: "" });
  const [deux, setDeux] = useState<boolean | null>(null);
  const [rep, setRep] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState("");

  const listePays = pays.map((p) => p.pays)
    .map((c) => ({ c, n: nomPays(c, langue) }))
    .sort((a, b) => a.n.localeCompare(b.n, langue));
  const indicatifs = [...new Set(Object.values(INDICATIFS))].sort((a, b) => Number(a) - Number(b));
  const champ = (k: keyof typeof v) => ({
    value: v[k],
    onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }),
    "aria-invalid": erreurs.includes(k === "tel" ? "whatsapp" : k) || undefined,
  });

  const choisirPays = (c: string) => {
    setV({ ...v, pays: c, indicatif: v.tel ? v.indicatif : (INDICATIFS[c] ?? v.indicatif) });
  };

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setMessage("");
    const whatsapp = formatInternational(v.indicatif, v.tel);
    const r = await appeler<{ jeton?: string; codes_test?: Envoi["codes_test"]; fields?: string[] }>("candidater", {
      prenom: v.prenom, nom: v.nom, email: v.email, whatsapp, pays: v.pays, age: Number(v.age),
      deux_telephones: deux, reponses: rep, consentement: ok, langue,
    });
    setEnvoi(false);
    if (!r.ok) {
      setErreurs(r.fields ?? []);
      setMessage(r.fields ? t("form.errors") : r.error === "network" ? t("err.network") : t("err.generic"));
      return;
    }
    garderJeton(r.jeton ?? null);
    onEnvoye({ prenom: v.prenom, email: v.email, whatsapp, codes_test: r.codes_test });
  }

  return (
    <main className="page etroite">
      <h1>{t("form.title")} <span className="pastille">{t("form.time")}</span></h1>
      <form className="formulaire" onSubmit={envoyer} noValidate>
        <div className="deux-colonnes">
          <label>{t("form.firstName")}<input autoComplete="given-name" required {...champ("prenom")} /></label>
          <label>{t("form.lastName")}<input autoComplete="family-name" required {...champ("nom")} /></label>
        </div>
        <label>{t("form.email")}<input type="email" autoComplete="email" required {...champ("email")} /></label>
        <label>{t("form.country")}
          <select value={v.pays} onChange={(e) => choisirPays(e.target.value)} aria-invalid={erreurs.includes("pays") || undefined}>
            <option value="">{t("form.choose")}</option>
            {listePays.map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <label>{t("form.whatsapp")}
          <div className="tel">
            <select value={v.indicatif} onChange={(e) => setV({ ...v, indicatif: e.target.value })} aria-label="+">
              {indicatifs.map((i) => <option key={i} value={i}>+{i}</option>)}
            </select>
            <input type="tel" inputMode="tel" autoComplete="tel-national" {...champ("tel")} />
          </div>
          <small>{t("form.whatsappHelp")}</small>
        </label>
        <label className="court">{t("form.age")}
          <input type="number" inputMode="numeric" min={13} max={99} {...champ("age")} />
        </label>
        <fieldset aria-invalid={erreurs.includes("deux_telephones") || undefined}>
          <legend>{t("form.twoPhones")}</legend>
          <div className="choix">
            <button type="button" className={deux === true ? "actif" : ""} onClick={() => setDeux(true)}>{t("form.yes")}</button>
            <button type="button" className={deux === false ? "actif" : ""} onClick={() => setDeux(false)}>{t("form.no")}</button>
          </div>
        </fieldset>
        {QUESTIONS.map((q) => (
          <label key={q}>{t(`q.${q}`)}
            <textarea rows={2} value={rep[q] ?? ""} aria-invalid={erreurs.includes(q) || undefined}
              onChange={(e) => setRep({ ...rep, [q]: e.target.value })} />
          </label>
        ))}
        <label className="case" aria-invalid={erreurs.includes("consentement") || undefined}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} required />
          <span>{t("form.consent")}</span>
        </label>
        {message && <p className="erreur" role="alert">{message}</p>}
        <button type="submit" className="bouton principal" disabled={envoi || !ok}>{envoi ? t("form.sending") : t("form.submit")}</button>
      </form>
    </main>
  );
}
