import { useState, type ReactNode } from "react";

import { appeler, type Moi } from "../api";
import { jourMois, limiteAvantLundi, limiteLocale, type T } from "../i18n";

// 25/11 (Max) : la page personnelle est une checklist (contrat, Ruul, TikTok, warm-up, Slack, premier post). Chaque
// étape a une consigne courte et un bouton, et se coche seule quand l'OS la voit faite (synchronisée par `moi`).
// Les mots (test persona) : la page Join est « ta page », l'OS est « ton dashboard » (ses accès arrivent par email,
// lien « Set my password »). L'étape TikTok donne tout le profil à créer : nom d'utilisateur, nom, photo, bio.

/** Les liens par défaut (une API plus ancienne ne les renvoie pas). */
const LIENS_DEFAUT = {
  dashboard: "https://sophia-marketing-orga.vercel.app",
  slack: "https://join.slack.com/t/sophia-system/shared_invite/zt-4hweboq01-NKLzgvGLbJMHBtoB7N0iBQ",
  tiktok: "https://www.tiktok.com/signup",
  ruul: "https://app.ruul.io/register",
  ruul_personnel: false,
};

function Copier({ t, texte }: { t: T; texte: string }) {
  const [fait, setFait] = useState(false);
  return (
    <button type="button" className="btn btn--xs btn--ghost" onClick={() => {
      navigator.clipboard?.writeText(texte).then(() => {
        setFait(true);
        setTimeout(() => setFait(false), 1500);
      }).catch(() => undefined);
    }}>{fait ? t("copied") : t("copy")}</button>
  );
}

function Etape({ titre, fait, note, children }: { titre: string; fait: boolean; note?: string; children?: ReactNode }) {
  return (
    <li className={`etape ${fait ? "faite" : ""}`}>
      <div className="etape__tete">
        <span className="coche" aria-hidden="true">{fait ? "✓" : ""}</span>
        <h3 className="h3">{titre}</h3>
      </div>
      {fait ? note && <p className="discret">{note}</p> : <div className="etape__corps">{children}</div>}
    </li>
  );
}

/** Une ligne du profil TikTok à créer : le libellé, la valeur et, au besoin, « Copier ». */
function LigneProfil({ t, libelle, valeur, copier }: { t: T; libelle: string; valeur: string; copier?: string }) {
  return (
    <div className="profil__ligne">
      <dt>{libelle}</dt>
      <dd>
        {copier ? <code>{valeur}</code> : <span>{valeur}</span>}
        {copier && <Copier t={t} texte={copier} />}
      </dd>
    </div>
  );
}

/** Un bouton qui ouvre un lien (Ruul, TikTok, dashboard, Slack) dans un nouvel onglet. */
function Lien({ href, children, discret }: { href: string; children: ReactNode; discret?: boolean }) {
  return <a className={`btn btn--sm${discret ? " btn--ghost" : ""}`} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export default function Dashboard({ t, langue, moi, onMaj }: { t: T; langue: string; moi: Moi; onMaj: () => void }) {
  const ligne = (e: string) => moi.etapes.find((x) => x.etape === e);
  const statut = (e: string) => ligne(e)?.statut ?? "a_faire";
  const fait = (e: string) => moi.checklist?.find((x) => x.etape === e)?.fait ?? (statut(e) === "fait" || statut(e) === "ok");
  const liens = moi.liens ?? LIENS_DEFAUT;
  const handle = moi.handle ?? String(ligne("tiktok")?.valeur?.handle ?? moi.candidature.handle_tiktok ?? "");
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState("");
  const test = moi.mode === "test";

  async function verifierTiktok(h: string) {
    setEnCours(true);
    setMsg("");
    const r = await appeler("etape", { etape: "tiktok", valeur: { handle: h } });
    setEnCours(false);
    if (!r.ok) setMsg(t("err.generic"));
    onMaj();
  }

  const st = statut("tiktok");
  const profil = moi.profil_suggere;
  const lundi = moi.premier_post;
  return (
    <main className="halo page">
      <div className="wrap etroite" style={{ display: "grid", gap: 16 }}>
      <span className="label">{t("dash.hello", { name: moi.candidature.prenom })}</span>
      {lundi && (
        <div className="annonce">
          <strong>{t("dash.firstPost", { date: jourMois(lundi, langue) })}</strong>
          {!fait("warmup") && <p>{t("dash.slip", { limit: limiteLocale(limiteAvantLundi(lundi), langue) })}</p>}
        </div>
      )}
      <h1 className="h2">{t("chk.title")}</h1>
      <p className="discret">{t("chk.intro")}</p>
      {test && <p className="discret">{t("step.simulated")}</p>}
      {msg && <p className="erreur" role="alert">{msg}</p>}
      <ol className="checklist">
        <Etape titre={t("chk.contrat.title")} fait={fait("contrat") || !!moi.signature}
          note={moi.signature ? t("chk.contrat.done", { date: jourMois(moi.signature.signe_at.slice(0, 10), langue) }) : undefined} />

        <Etape titre={t("chk.ruul.title")} fait={fait("ruul")}>
          <p>{t("chk.ruul.body", { email: moi.ruul_email ?? moi.candidature.email })}</p>
          <Lien href={liens.ruul}>{liens.ruul_personnel ? t("chk.ruul.open") : t("chk.ruul.create")}</Lien>
        </Etape>

        <Etape titre={t("step.tiktok.title")} fait={fait("tiktok")} note={handle ? `@${handle}` : undefined}>
          <p>{t("step.tiktok.body")}</p>
          <dl className="profil">
            {handle && <LigneProfil t={t} libelle={t("chk.tiktok.username")} valeur={`@${handle}`} copier={handle} />}
            {profil?.nom && <LigneProfil t={t} libelle={t("step.profil.name")} valeur={profil.nom} copier={profil.nom} />}
            {profil?.photo_url ? (
              <div className="profil__ligne">
                <dt>{t("step.profil.photo")}</dt>
                <dd>
                  <a href={profil.photo_url} target="_blank" rel="noopener noreferrer"><img className="profil__photo" src={profil.photo_url} alt="" /></a>
                  <span>{t("chk.tiktok.photoTap")}</span>
                </dd>
              </div>
            ) : <LigneProfil t={t} libelle={t("step.profil.photo")} valeur={t("chk.tiktok.photoTip")} />}
            {profil?.bio && <LigneProfil t={t} libelle={t("step.profil.bio")} valeur={profil.bio} copier={profil.bio} />}
          </dl>
          {st === "introuvable" && <p className="erreur">{t("step.tiktok.notFound", { handle })}</p>}
          {st === "illisible" && <p className="erreur">{t("step.tiktok.unreadable")}</p>}
          <div className="rangee" style={{ width: "100%" }}>
            <Lien href={liens.tiktok} discret>{t("chk.tiktok.open")}</Lien>
            {st === "introuvable" ? (
              <>
                <input value={saisie} placeholder="@username" onChange={(e) => setSaisie(e.target.value)} />
                <button type="button" className="btn btn--sm btn--ghost" disabled={enCours || !saisie} onClick={() => verifierTiktok(saisie)}>
                  {enCours ? t("step.tiktok.checking") : t("step.tiktok.check")}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--sm" disabled={enCours || !handle} onClick={() => verifierTiktok(handle)}>
                {enCours ? t("step.tiktok.checking") : t("step.tiktok.created")}
              </button>
            )}
          </div>
        </Etape>

        <Etape titre={t("chk.warmup.title")} fait={fait("warmup")}>
          <p>{t("chk.warmup.body")}</p>
          <p className="discret">{t("chk.dashboard.login")}</p>
          <Lien href={liens.dashboard}>{t("chk.dashboard")}</Lien>
        </Etape>

        <Etape titre={t("step.slack.title")} fait={fait("slack")}>
          <p>{t("chk.slack.body")}</p>
          <Lien href={liens.slack}>{t("step.slack.join")}</Lien>
        </Etape>

        <Etape titre={t("chk.post.title")} fait={fait("premier_post")}>
          <p>{t("chk.post.body", { date: lundi ? jourMois(lundi, langue) : "—" })}</p>
          <Lien href={liens.dashboard}>{t("chk.dashboard")}</Lien>
        </Etape>
      </ol>
      </div>
    </main>
  );
}
