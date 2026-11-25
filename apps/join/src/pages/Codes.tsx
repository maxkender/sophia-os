import { useState } from "react";

import { appeler } from "../api";
import type { T } from "../i18n";
import type { Envoi } from "./Candidature";

type Canal = "email" | "whatsapp";

function LigneCode({ t, canal, codeTest, fait, onVerifie }: {
  t: T;
  canal: Canal;
  codeTest?: string;
  fait: boolean;
  onVerifie: (r: { email_verifie: boolean; whatsapp_verifie: boolean }) => void;
}) {
  const [code, setCode] = useState("");
  const [test, setTest] = useState(codeTest);
  const [msg, setMsg] = useState("");

  async function verifier() {
    setMsg("");
    const r = await appeler<{ email_verifie: boolean; whatsapp_verifie: boolean; essais_restants?: number }>("verifier", { canal, code });
    if (r.ok) return onVerifie(r);
    if (r.error === "wrong_code") setMsg(t("codes.wrong", { n: r.essais_restants ?? 0 }));
    else if (r.error === "expire") setMsg(t("codes.expired"));
    else if (r.error === "trop_essais") setMsg(t("codes.tooMany"));
    else setMsg(t("err.generic"));
  }

  async function renvoyer() {
    const r = await appeler<{ codes_test?: Record<string, string> }>("renvoyer_code", { canal });
    if (r.ok) {
      setTest(r.codes_test?.[canal]);
      setMsg("");
      setCode("");
    }
  }

  const id = `code-${canal}`;
  return (
    <div className="carte" style={{ display: "grid", gap: 12 }}>
      <label className="champ" htmlFor={id}>{t(canal === "email" ? "codes.email" : "codes.whatsapp")}</label>
      {fait ? <p className="ok">✓ {t("codes.verified")}</p> : (
        <div className="rangee">
          <input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
          <button type="button" className="btn btn--sm" disabled={code.length !== 6} onClick={verifier}>{t("codes.verify")}</button>
        </div>
      )}
      {!fait && test && <p className="code-test">{t("codes.test", { code: test })}</p>}
      {msg && <p className="erreur" role="alert">{msg}</p>}
      {!fait && <button type="button" className="lien" style={{ justifySelf: "start" }} onClick={renvoyer}>{t("codes.resend")}</button>}
    </div>
  );
}

export default function Codes({ t, envoi, onVerifie }: { t: T; envoi: Envoi; onVerifie: () => void }) {
  const [etat, setEtat] = useState({ email_verifie: false, whatsapp_verifie: false });
  // 25/11 (Max) : sans code WhatsApp (le serveur le dit), le code par email suffit.
  const avecWhatsapp = envoi.whatsapp_code !== false;
  const tout = etat.email_verifie && (etat.whatsapp_verifie || !avecWhatsapp);
  return (
    <main className="halo page">
      <div className="wrap etroite">
        <div className="section__head">
          <span className="label">{t("codes.label")}</span>
          <h1 className="h2">{t(avecWhatsapp ? "codes.title" : "codes.titleEmail")}</h1>
          <p className="lede">{t(avecWhatsapp ? "codes.sub" : "codes.subEmail", { email: envoi.email, whatsapp: envoi.whatsapp })}</p>
        </div>
        <LigneCode t={t} canal="email" codeTest={envoi.codes_test?.email} fait={etat.email_verifie} onVerifie={setEtat} />
        {avecWhatsapp && <LigneCode t={t} canal="whatsapp" codeTest={envoi.codes_test?.whatsapp} fait={etat.whatsapp_verifie} onVerifie={setEtat} />}
        <div style={{ marginTop: 20 }}>
          <button type="button" className="btn btn--plein" disabled={!tout} onClick={onVerifie}>{t("codes.continue")}</button>
        </div>
      </div>
    </main>
  );
}
