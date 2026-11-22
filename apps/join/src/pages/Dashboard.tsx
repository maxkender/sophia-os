import { useState, type ReactNode } from "react";

import { appeler, type Moi } from "../api";
import { dateLongue, type T } from "../i18n";

function Copier({ t, texte }: { t: T; texte: string }) {
  const [fait, setFait] = useState(false);
  return (
    <button type="button" className="bouton petit" onClick={() => {
      navigator.clipboard?.writeText(texte).then(() => {
        setFait(true);
        setTimeout(() => setFait(false), 1500);
      }).catch(() => undefined);
    }}>{fait ? t("copied") : t("copy")}</button>
  );
}

function Etape({ titre, fait, optionnel, t, children }: { titre: string; fait: boolean; optionnel?: boolean; t: T; children: ReactNode }) {
  return (
    <li className={`etape ${fait ? "faite" : ""}`}>
      <div className="etape-tete">
        <span className="coche" aria-hidden="true">{fait ? "✓" : ""}</span>
        <h3>{titre}</h3>
        {optionnel && <span className="pastille">{t("dash.optional")}</span>}
      </div>
      {!fait && <div className="etape-corps">{children}</div>}
    </li>
  );
}

export default function Dashboard({ t, langue, moi, onMaj }: { t: T; langue: string; moi: Moi; onMaj: () => void }) {
  const statut = (e: string) => moi.etapes.find((x) => x.etape === e)?.statut ?? "a_faire";
  const tiktok = moi.etapes.find((x) => x.etape === "tiktok");
  const handle = String(tiktok?.valeur?.handle ?? moi.candidature.handle_tiktok ?? "");
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState("");
  const test = moi.mode === "test";

  async function etape(nom: string, valeur: Record<string, unknown> = {}) {
    setEnCours(true);
    setMsg("");
    const r = await appeler("etape", { etape: nom, valeur });
    setEnCours(false);
    if (!r.ok) setMsg(t("err.generic"));
    onMaj();
  }

  const st = statut("tiktok");
  return (
    <main className="page etroite">
      <p className="discret">{t("dash.hello", { name: moi.candidature.prenom })}</p>
      {moi.premier_post && (
        <div className="annonce">
          <strong>{t("dash.firstPost", { date: dateLongue(moi.premier_post, langue) })}</strong>
          {statut("warmup") !== "fait" && <p>{t("dash.slip")}</p>}
        </div>
      )}
      <h1>{t("dash.title")}</h1>
      {msg && <p className="erreur" role="alert">{msg}</p>}
      <ol className="checklist">
        <Etape t={t} titre={t("step.tiktok.title")} fait={st === "ok"}>
          <p>{t("step.tiktok.body")}</p>
          <div className="copie"><code>@{handle}</code><Copier t={t} texte={handle} /></div>
          {st === "introuvable" && <p className="erreur">{t("step.tiktok.notFound", { handle })}</p>}
          {st === "illisible" && <p className="erreur">{t("step.tiktok.unreadable")}</p>}
          {st === "introuvable" ? (
            <div className="tel">
              <input value={saisie} placeholder="@username" onChange={(e) => setSaisie(e.target.value)} />
              <button type="button" className="bouton" disabled={enCours || !saisie} onClick={() => etape("tiktok", { handle: saisie })}>
                {enCours ? t("step.tiktok.checking") : t("step.tiktok.check")}
              </button>
            </div>
          ) : (
            <button type="button" className="bouton principal" disabled={enCours} onClick={() => etape("tiktok", { handle })}>
              {enCours ? t("step.tiktok.checking") : t("step.tiktok.created")}
            </button>
          )}
        </Etape>
        {st === "ok" && <p className="ok">{t("step.tiktok.ok", { handle })}</p>}

        <Etape t={t} titre={t("step.profil.title")} fait={statut("profil") === "fait"}>
          <p>{t("step.profil.body")}</p>
          <div className="copie"><span>{t("step.profil.name")}</span><code>{moi.profil_suggere.nom}</code><Copier t={t} texte={moi.profil_suggere.nom} /></div>
          <div className="copie"><span>{t("step.profil.bio")}</span><code>{moi.profil_suggere.bio}</code><Copier t={t} texte={moi.profil_suggere.bio} /></div>
          <div className="copie"><span>{t("step.profil.photo")}</span><code lang="en">{moi.profil_suggere.photo}</code><Copier t={t} texte={moi.profil_suggere.photo} /></div>
          <button type="button" className="bouton principal" disabled={enCours} onClick={() => etape("profil")}>{t("step.profil.done")}</button>
        </Etape>

        <Etape t={t} titre={t("step.warmup.title")} fait={statut("warmup") === "fait"}>
          <p>{t("step.warmup.body")}</p>
          <button type="button" className="bouton principal" disabled={enCours} onClick={() => etape("warmup", { fini: true })}>{t("step.warmup.done")}</button>
        </Etape>

        <Etape t={t} titre={t("step.slack.title")} optionnel fait={statut("slack") !== "a_faire"}>
          <p>{t("step.slack.body")}</p>
          <button type="button" className="bouton" disabled={enCours} onClick={() => etape("slack")}>{t("step.slack.join")}</button>
          {test && <p className="discret">{t("step.simulated")}</p>}
        </Etape>
        {statut("slack") === "simule" && test && <p className="discret">Slack — {t("step.simulated")}</p>}

        {moi.ruul_visible && (
          <Etape t={t} titre={t("step.ruul.title")} fait={statut("ruul") !== "a_faire"}>
            <p>{t("step.ruul.body")}</p>
            <button type="button" className="bouton principal" disabled={enCours} onClick={() => etape("ruul")}>{t("step.ruul.go")}</button>
            {test && <p className="discret">{t("step.simulated")}</p>}
          </Etape>
        )}
      </ol>
    </main>
  );
}
