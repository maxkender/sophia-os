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

  return (
    <div className="carte">
      <label>{t(canal === "email" ? "codes.email" : "codes.whatsapp")}
        {fait ? <p className="ok">{t("codes.verified")}</p> : (
          <div className="tel">
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <button type="button" className="bouton" disabled={code.length !== 6} onClick={verifier}>{t("codes.verify")}</button>
          </div>
        )}
      </label>
      {!fait && test && <p className="code-test">{t("codes.test", { code: test })}</p>}
      {msg && <p className="erreur" role="alert">{msg}</p>}
      {!fait && <button type="button" className="lien" onClick={renvoyer}>{t("codes.resend")}</button>}
    </div>
  );
}

export default function Codes({ t, envoi, onVerifie }: { t: T; envoi: Envoi; onVerifie: () => void }) {
  const [etat, setEtat] = useState({ email_verifie: false, whatsapp_verifie: false });
  const tout = etat.email_verifie && etat.whatsapp_verifie;
  return (
    <main className="page etroite">
      <h1>{t("codes.title")}</h1>
      <p className="sous-titre">{t("codes.sub", { email: envoi.email, whatsapp: envoi.whatsapp })}</p>
      <LigneCode t={t} canal="email" codeTest={envoi.codes_test?.email} fait={etat.email_verifie} onVerifie={setEtat} />
      <LigneCode t={t} canal="whatsapp" codeTest={envoi.codes_test?.whatsapp} fait={etat.whatsapp_verifie} onVerifie={setEtat} />
      <button type="button" className="bouton principal" disabled={!tout} onClick={onVerifie}>{t("codes.continue")}</button>
    </main>
  );
}
