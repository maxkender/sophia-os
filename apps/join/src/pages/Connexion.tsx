import { useState, type FormEvent } from "react";

import { appeler, garderJeton } from "../api";
import type { T } from "../i18n";

export default function Connexion({ t, onConnecte }: { t: T; onConnecte: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [codeTest, setCodeTest] = useState<string | undefined>();
  const [msg, setMsg] = useState("");

  async function demander(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const r = await appeler<{ codes_test?: { email?: string } }>("connexion_code", { email });
    if (!r.ok) return setMsg(t("err.generic"));
    setEnvoye(true);
    setCodeTest(r.codes_test?.email);
  }

  async function entrer(e: FormEvent) {
    e.preventDefault();
    const r = await appeler<{ jeton: string }>("connexion", { email, code });
    if (!r.ok) return setMsg(t("login.wrong"));
    garderJeton(r.jeton);
    onConnecte();
  }

  return (
    <main className="halo page">
      <div className="wrap etroite">
      <div className="section__head">
        <span className="label">{t("nav.login")}</span>
        <h1 className="h2">{t("login.title")}</h1>
        <p className="lede">{t("login.sub")}</p>
      </div>
      {!envoye ? (
        <form className="carte formulaire" onSubmit={demander}>
          <label className="champ">{t("login.email")}<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button type="submit" className="btn btn--plein" disabled={!email}>{t("login.send")}</button>
        </form>
      ) : (
        <form className="carte formulaire" onSubmit={entrer}>
          <label className="champ">{t("login.code")}
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
          {codeTest && <p className="code-test">{t("codes.test", { code: codeTest })}</p>}
          <button type="submit" className="btn btn--plein" disabled={code.length !== 6}>{t("login.go")}</button>
        </form>
      )}
      {msg && <p className="erreur" role="alert">{msg}</p>}
      </div>
    </main>
  );
}
