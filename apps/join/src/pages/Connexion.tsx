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
    <main className="page etroite">
      <h1>{t("login.title")}</h1>
      <p className="sous-titre">{t("login.sub")}</p>
      {!envoye ? (
        <form className="formulaire" onSubmit={demander}>
          <label>{t("login.email")}<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button type="submit" className="bouton principal" disabled={!email}>{t("login.send")}</button>
        </form>
      ) : (
        <form className="formulaire" onSubmit={entrer}>
          <label>{t("login.code")}
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
          {codeTest && <p className="code-test">{t("codes.test", { code: codeTest })}</p>}
          <button type="submit" className="bouton principal" disabled={code.length !== 6}>{t("login.go")}</button>
        </form>
      )}
      {msg && <p className="erreur" role="alert">{msg}</p>}
    </main>
  );
}
