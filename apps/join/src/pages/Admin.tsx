import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { appelerAdmin, connexionAdmin, garderSessionAdmin, lireSessionAdmin } from "../api";
import { nomPays } from "../i18n";

// Le dashboard admin de Join (/admin) : réservé aux admins de l'OS (is_admin() vérifié côté serveur à chaque appel).
// Interface en français (équipe), jamais montrée aux candidats.

type Etape = "ferme" | "codes" | "verifiee" | "a_traiter" | "acceptee" | "signee" | "refusee" | "expiree";

interface Ligne {
  id: string;
  test: boolean;
  prenom: string;
  nom: string;
  email: string;
  pays: string;
  cree_at: string;
  etape: Etape;
  email_verifie: boolean;
  whatsapp_verifie: boolean;
  eligible: boolean | null;
  manques: string[];
  /** 26/11 : ce que l'admin doit voir sans que la candidature attende (même nom qu'une autre candidature…). */
  alertes?: string[];
  cohorte: string | null;
  whatsapp_optin: boolean;
  source: string | null;
  accepter: boolean;
  refuser: boolean;
}

interface Fiche {
  candidature: Ligne & Record<string, unknown>;
  evenements: { type: string; at: string; detail: Record<string, unknown> }[];
  messages: { etape: string; canal: string; statut: string; at: string; objet: string | null; texte: string | null }[];
  signature: { version: string; signe_at: string; nom_legal: string | null; ruul_email: string | null } | null;
  etapes: { etape: string; statut: string; maj_at: string }[];
}

const ETAPES: { cle: Etape; nom: string }[] = [
  { cle: "codes", nom: "Codes à vérifier" },
  { cle: "verifiee", nom: "Codes vérifiés" },
  { cle: "a_traiter", nom: "À décider" },
  { cle: "acceptee", nom: "Acceptée (contrat à signer)" },
  { cle: "signee", nom: "Contrat signé" },
  { cle: "refusee", nom: "Refusée" },
  { cle: "expiree", nom: "Offre expirée" },
  { cle: "ferme", nom: "Pays fermé" },
];
const NOM_ETAPE = Object.fromEntries(ETAPES.map((e) => [e.cle, e.nom])) as Record<Etape, string>;

const STATUT: Record<string, string> = { envoye: "envoyé", bloque: "bloqué (test : pas un testeur)", simule: "simulé" };

/** 0858 : les drapeaux de join_reel, dans l'ordre de l'enchaînement. */
const NOM_REEL: Record<string, string> = { compte_os: "compte OS", acces: "bienvenue", ruul: "invitation Ruul", rappels: "rappels", whatsapp: "WhatsApp" };

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function Connexion({ onOk }: { onOk: () => void }) {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur("");
    const r = await connexionAdmin(email, mdp);
    setEnvoi(false);
    setMdp("");
    if (r.ok) return onOk();
    setErreur(r.error === "forbidden" ? "Accès réservé aux admins de l'OS." : r.error === "network" ? "Pas de connexion." : "Email ou mot de passe incorrect.");
  }

  return (
    <main className="page">
      <form className="wrap etroite carte formulaire" onSubmit={envoyer} style={{ maxWidth: 420 }}>
        <h1 className="h3">Join · admin</h1>
        <p className="discret">Connexion avec ton compte de l'OS (admin seulement).</p>
        <label className="champ">Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="champ">Mot de passe<input type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} /></label>
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
        <button type="submit" className="btn btn--plein" disabled={envoi || !email || !mdp}>{envoi ? "…" : "Se connecter"}</button>
      </form>
    </main>
  );
}

function FicheCandidat({ id, onFermer, onDecide }: { id: string; onFermer: () => void; onDecide: () => void }) {
  const [f, setF] = useState<Fiche | null>(null);
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    const r = await appelerAdmin<Fiche>("admin_fiche", { id });
    if (r.ok) setF(r);
    else setErreur(r.error ?? "erreur");
  }, [id]);

  useEffect(() => {
    setF(null);
    charger();
  }, [charger]);

  async function decider(decision: "accepter" | "refuser") {
    const c = f?.candidature;
    if (!c) return;
    const qui = `${c.prenom} ${c.nom}`;
    if (!globalThis.confirm(decision === "accepter"
      ? `Accepter ${qui} ? Le candidat reçoit le lien du contrat (en test : seulement les testeurs). Après sa signature, il est relié à l'OS (en live).`
      : `Refuser ${qui} ? Le candidat reçoit un email de refus (en test : seulement les testeurs).`)) return;
    setEnvoi(true);
    setErreur("");
    const r = await appelerAdmin("admin_decider", { id, decision, note });
    setEnvoi(false);
    if (!r.ok) return setErreur(r.error ?? "erreur");
    setNote("");
    await charger();
    onDecide();
  }

  if (!f) return <aside className="adm__fiche carte"><p className="discret">{erreur || "…"}</p></aside>;
  const c = f.candidature;
  const reponses = (c.reponses ?? {}) as Record<string, string>;
  const source = (c.source_brute ?? {}) as Record<string, string>;
  return (
    <aside className="adm__fiche carte" aria-label="Fiche candidat">
      <div className="adm__fiche-tete">
        <h2 className="h3">{c.prenom} {c.nom} {c.test && <span className="adm__badge adm__badge--test">test</span>}</h2>
        <button type="button" className="nav__link" onClick={onFermer}>Fermer</button>
      </div>
      <p><span className={`adm__badge adm__badge--${c.etape}`}>{NOM_ETAPE[c.etape]}</span>
        {c.etape === "a_traiter" && <span className="discret"> {c.eligible ? "· remplit les conditions" : `· manque : ${c.manques.join(", ")}`}</span>}
      </p>
      {(c.alertes ?? []).length > 0 && <p className="discret">⚠ Alertes (ne bloquent pas) : {(c.alertes ?? []).join(", ")}</p>}
      <dl className="adm__dl">
        <dt>Email</dt><dd>{c.email} {c.email_verifie ? "✓" : "·"}</dd>
        <dt>WhatsApp</dt><dd>{String(c.whatsapp ?? "")} {c.whatsapp_verifie ? "✓" : "·"} · messages : {c.whatsapp_optin ? "oui" : "non"}</dd>
        <dt>Pays</dt><dd>{nomPays(c.pays, "fr")} ({c.pays})</dd>
        <dt>Candidature</dt><dd>{dateHeure(c.cree_at)} · langue {String(c.langue ?? "")}</dd>
        <dt>18 ans +</dt><dd>{c.majeur === true ? "oui" : c.age != null ? `${String(c.age)} ans` : "?"} · 2e téléphone : {c.deux_telephones === true ? "oui" : c.deux_telephones === false ? "non" : "non demandé"}</dd>
        <dt>Source</dt><dd>{[c.entendu, c.parrain ? `parrain : ${String(c.parrain)}` : null, ...Object.entries(source).filter(([k]) => k !== "at").map(([k, v]) => `${k}=${v}`)].filter(Boolean).join(" · ") || "—"}</dd>
        {c.cohorte && <><dt>Cohorte</dt><dd>{c.cohorte}</dd></>}
        {c.handle_tiktok ? <><dt>TikTok</dt><dd>@{String(c.handle_tiktok)}</dd></> : null}
        {c.decision_at ? <><dt>Décision</dt><dd>{dateHeure(String(c.decision_at))} · {c.decision_par ? "admin" : "règles de l'OS"}{c.decision_note ? ` · « ${String(c.decision_note)} »` : ""}</dd></> : null}
        {c.profile_id ? <><dt>Compte OS</dt><dd>{String(c.email_os ?? c.profile_id)}</dd></> : null}
      </dl>
      {Object.keys(reponses).length > 0 && (
        <details><summary>Réponses (format OS)</summary>
          <dl className="adm__dl">{Object.entries(reponses).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </details>
      )}

      {(c.accepter || c.refuser) && (
        <div className="adm__decision">
          <label className="champ">Note (facultatif, interne)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
          <div className="adm__boutons">
            {c.accepter && <button type="button" className="btn btn--sm" disabled={envoi} onClick={() => decider("accepter")}>Accepter</button>}
            {c.refuser && <button type="button" className="btn btn--sm btn--ghost" disabled={envoi} onClick={() => decider("refuser")}>Refuser</button>}
          </div>
        </div>
      )}
      {erreur && <p className="erreur" role="alert">{erreur}</p>}

      {f.signature && (
        <>
          <h3 className="legal__st">Signature</h3>
          <p>{dateHeure(f.signature.signe_at)} · {f.signature.version} · « {f.signature.nom_legal} » · Ruul : {f.signature.ruul_email}</p>
        </>
      )}
      {f.etapes.length > 0 && (
        <>
          <h3 className="legal__st">Étapes du dashboard</h3>
          <ul className="adm__liste">{f.etapes.map((e) => <li key={e.etape}>{e.etape} : {e.statut} <span className="discret">({dateHeure(e.maj_at)})</span></li>)}</ul>
        </>
      )}

      <h3 className="legal__st">Historique</h3>
      <ul className="adm__liste">
        {f.evenements.map((e, i) => (
          <li key={i}><span className="discret">{dateHeure(e.at)}</span> {e.type}
            {Object.keys(e.detail ?? {}).length > 0 && <code className="adm__detail">{JSON.stringify(e.detail)}</code>}
          </li>
        ))}
      </ul>

      <h3 className="legal__st">Messages envoyés</h3>
      {f.messages.length === 0 ? <p className="discret">Aucun.</p> : (
        <ul className="adm__liste">
          {f.messages.map((m, i) => (
            <li key={i}>
              <span className="discret">{dateHeure(m.at)}</span> {m.etape} · {m.canal} · {STATUT[m.statut] ?? m.statut}
              {m.texte && (
                <details><summary>{m.objet}</summary><pre className="adm__texte" lang="en">{m.texte}</pre></details>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export default function Admin() {
  const [connecte, setConnecte] = useState(() => !!lireSessionAdmin());
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [mode, setMode] = useState("");
  const [auto, setAuto] = useState(false);
  const [reel, setReel] = useState<Record<string, boolean> | null>(null);
  const [luAt, setLuAt] = useState("");
  const [erreur, setErreur] = useState("");
  const [filtreEtape, setFiltreEtape] = useState("");
  const [filtrePays, setFiltrePays] = useState("");
  const [choisi, setChoisi] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const r = await appelerAdmin<{ mode: string; auto_acceptation: boolean; reel?: Record<string, boolean>; candidatures: Ligne[]; lu_at: string }>("admin_liste");
    if (!r.ok) {
      if (r.error === "forbidden") setConnecte(false);
      else setErreur(r.error === "network" ? "Pas de connexion." : r.error ?? "erreur");
      return;
    }
    setErreur("");
    setLignes(r.candidatures);
    setMode(r.mode);
    setAuto(r.auto_acceptation);
    setReel(r.reel ?? null);
    setLuAt(r.lu_at);
  }, []);

  // En temps réel : la liste est relue toutes les 15 secondes (et au retour sur l'onglet).
  useEffect(() => {
    if (!connecte) return;
    charger();
    const id = setInterval(() => document.visibilityState === "visible" && charger(), 15_000);
    const vu = () => document.visibilityState === "visible" && charger();
    document.addEventListener("visibilitychange", vu);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", vu);
    };
  }, [connecte, charger]);

  const pays = useMemo(() => [...new Set(lignes.map((l) => l.pays))].sort(), [lignes]);
  const visibles = lignes.filter((l) => (!filtreEtape || l.etape === filtreEtape) && (!filtrePays || l.pays === filtrePays));
  const compte = (e: Etape) => lignes.filter((l) => l.etape === e).length;

  async function basculer() {
    const cible = !auto;
    const texte = cible
      ? "Allumer l'acceptation automatique ?\n\nUne candidature qui remplit les conditions sera acceptée seule (sans ta décision)."
      : "Éteindre l'acceptation automatique ?\n\nToutes les candidatures attendront ta décision.";
    // L'interrupteur ne décide que de l'acceptation : tout candidat accepté est relié à l'OS après sa signature
    // (en live ; simulé en mode test).
    if (!globalThis.confirm(texte)) return;
    const r = await appelerAdmin<{ auto_acceptation: boolean }>("admin_reglage", { auto_acceptation: cible });
    if (r.ok) setAuto(r.auto_acceptation);
    else setErreur(r.error ?? "erreur");
  }

  if (!connecte) return <Connexion onOk={() => setConnecte(true)} />;
  return (
    <main className="page adm">
      <div className="adm__wrap">
        <div className="adm__tete">
          <div>
            <h1 className="h3">Candidatures Join {mode && <span className={`adm__badge ${mode === "test" ? "adm__badge--test" : "adm__badge--signee"}`}>{mode === "test" ? "mode test" : "live"}</span>}</h1>
            <p className="discret">{lignes.length} candidatures · relu à {luAt ? dateHeure(luAt) : "…"} (toutes les 15 s)</p>
            {reel && (
              // 0858 : les étapes d'après la signature, réelles seulement si leur drapeau join_reel est à true (lecture seule).
              <p className="discret">Après la signature (join_reel) : {Object.entries(NOM_REEL).map(([k, nom]) => `${nom} ${reel[k] ? "réel" : "simulé"}`).join(" · ")}</p>
            )}
          </div>
          <div className="adm__actions">
            <label className="adm__interrupteur">
              <input type="checkbox" role="switch" checked={auto} onChange={basculer} aria-checked={auto} />
              <span>Acceptation automatique : <strong>{auto ? "ON" : "OFF"}</strong></span>
            </label>
            <button type="button" className="nav__link" onClick={() => {
              garderSessionAdmin(null);
              setConnecte(false);
            }}>Se déconnecter</button>
          </div>
        </div>
        {erreur && <p className="erreur" role="alert">{erreur}</p>}

        <div className="adm__filtres">
          <select value={filtreEtape} onChange={(e) => setFiltreEtape(e.target.value)} aria-label="Étape">
            <option value="">Toutes les étapes</option>
            {ETAPES.map((e) => <option key={e.cle} value={e.cle}>{e.nom} ({compte(e.cle)})</option>)}
          </select>
          <select value={filtrePays} onChange={(e) => setFiltrePays(e.target.value)} aria-label="Pays">
            <option value="">Tous les pays</option>
            {pays.map((p) => <option key={p} value={p}>{nomPays(p, "fr")} ({lignes.filter((l) => l.pays === p).length})</option>)}
          </select>
        </div>

        <div className="adm__corps">
          <div className="adm__table-zone">
            <table className="adm__table">
              <thead>
                <tr><th>Nom</th><th>Pays</th><th>Date</th><th>Étape</th><th>Source</th><th>WhatsApp</th></tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <tr key={l.id} className={choisi === l.id ? "adm__choisi" : undefined} onClick={() => setChoisi(l.id)} tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setChoisi(l.id)}>
                    <td>{l.prenom} {l.nom} {l.test && <span className="adm__badge adm__badge--test">test</span>}</td>
                    <td title={nomPays(l.pays, "fr")}>{l.pays}</td>
                    <td>{dateHeure(l.cree_at)}</td>
                    <td><span className={`adm__badge adm__badge--${l.etape}`}>{NOM_ETAPE[l.etape]}</span>
                      {l.etape === "a_traiter" && l.eligible && <span className="discret"> ✓</span>}</td>
                    <td>{l.source ?? "—"}</td>
                    <td>{l.whatsapp_optin ? "oui" : "non"}</td>
                  </tr>
                ))}
                {visibles.length === 0 && <tr><td colSpan={6} className="discret">Aucune candidature.</td></tr>}
              </tbody>
            </table>
          </div>
          {choisi && <FicheCandidat id={choisi} onFermer={() => setChoisi(null)} onDecide={charger} />}
        </div>
      </div>
    </main>
  );
}
