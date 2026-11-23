import { useCallback, useEffect, useMemo, useState } from "react";

import { appeler, capterSource, garderJeton, lireJeton, type Moi, type PaysPaie } from "./api";
import { langueInitiale, LANGUES, traducteur } from "./i18n";
import { Logo } from "./Logo";
import Arrivee from "./pages/Arrivee";
import Candidature, { type Envoi } from "./pages/Candidature";
import Codes from "./pages/Codes";
import Connexion from "./pages/Connexion";
import Contrat from "./pages/Contrat";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Decision from "./pages/Decision";
import Etat from "./pages/Etat";
import Faq from "./pages/Faq";
import Legal from "./pages/Legal";
import Modele from "./pages/Modele";

type Ecran =
  | "arrivee" | "candidature" | "ferme" | "codes" | "decision" | "contrat" | "dashboard" | "connexion" | "legal" | "privacy"
  | "expiree" | "refusee" | "modele" | "faq";

/** Les pages publiques qui ont leur propre adresse (liens partageables) ; /admin est à part. */
const CHEMINS: Partial<Record<Ecran, string>> = { modele: "/contract", legal: "/legal", privacy: "/privacy", faq: "/faq" };

function ecranDuChemin(): Ecran | null {
  const p = location.pathname.replace(/\/+$/, "") || "/";
  return (Object.entries(CHEMINS).find(([, c]) => c === p)?.[0] as Ecran | undefined) ?? null;
}

export default function App() {
  if (location.pathname.replace(/\/+$/, "") === "/admin") return <Admin />;
  return <Site />;
}

function Site() {
  const [langue, setLangue] = useState(langueInitiale);
  const t = useMemo(() => traducteur(langue), [langue]);
  const [ecran, setEcran] = useState<Ecran>(() => ecranDuChemin() ?? "arrivee");
  const [mode, setMode] = useState("test");
  const [pays, setPays] = useState<PaysPaie[]>([]);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [moi, setMoi] = useState<Moi | null>(null);

  const aller = (e: Ecran) => {
    setEcran(e);
    const chemin = CHEMINS[e] ?? "/";
    try {
      if (location.pathname !== chemin) history.pushState(null, "", `${chemin}${location.search}`);
    } catch {
      // historique indisponible
    }
    globalThis.scrollTo(0, 0);
  };

  useEffect(() => {
    const retour = () => setEcran(ecranDuChemin() ?? "arrivee");
    addEventListener("popstate", retour);
    return () => removeEventListener("popstate", retour);
  }, []);

  const chargerMoi = useCallback(async (orienter: boolean) => {
    if (!lireJeton()) return;
    const r = await appeler<Moi>("moi");
    if (!r.ok) {
      if (r.error === "session") garderJeton(null);
      return;
    }
    setMoi(r);
    if (!orienter) return;
    const c = r.candidature;
    setEnvoi((e) => e ?? { prenom: c.prenom, email: c.email, whatsapp: c.whatsapp });
    if (r.signature) aller("dashboard");
    else if (r.expiree) aller("expiree");
    else if (c.ferme) aller("ferme");
    else if (c.decision === "refusee") aller("refusee");
    else if (c.decision === "auto") aller("contrat");
    else if (c.decision === "a_traiter" || (c.email_verifie && c.whatsapp_verifie)) aller("decision");
    else aller("codes");
  }, []);

  useEffect(() => {
    document.documentElement.lang = langue;
    try {
      localStorage.setItem("join_langue", langue);
    } catch {
      // stockage indisponible
    }
  }, [langue]);

  useEffect(() => {
    capterSource();
    appeler<{ mode: string; pays: PaysPaie[] }>("pays_et_paie").then((r) => {
      if (!r.ok) return;
      setMode(r.mode);
      setPays(r.pays);
    });
    try {
      if (!sessionStorage.getItem("join_visite")) {
        sessionStorage.setItem("join_visite", "1");
        const p = new URLSearchParams(location.search);
        appeler("visite", { langue: langueInitiale(), source: p.get("utm_source") ?? p.get("src") ?? (p.get("ref") ? "ref" : "") });
      }
    } catch {
      // stockage indisponible : pas de visite comptée
    }
    // Une page publique ouverte par son adresse (/contract, /legal…) reste affichée.
    chargerMoi(!ecranDuChemin());
  }, [chargerMoi]);

  const connecte = !!moi?.signature;
  return (
    <>
      {mode === "test" && <div className="bandeau-test" role="status">{t("test.banner")}</div>}
      <header className="nav">
        <div className="wrap nav__bar">
          <Logo onClick={() => aller(connecte ? "dashboard" : "arrivee")} />
          <div className="nav__right">
            <select className="lang" aria-label="Language" value={langue} onChange={(e) => setLangue(e.target.value)}>
              {LANGUES.map((l) => <option key={l.code} value={l.code}>{l.nom}</option>)}
            </select>
            {connecte ? (
              <button type="button" className="nav__link" onClick={() => {
                garderJeton(null);
                setMoi(null);
                aller("arrivee");
              }}>{t("nav.logout")}</button>
            ) : (
              <>
                <button type="button" className="nav__link" onClick={() => aller("connexion")}>{t("nav.login")}</button>
                {ecran === "arrivee" && (
                  <button type="button" className="btn btn--sm nav__cta" onClick={() => aller("candidature")}>{t("nav.apply")}</button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {ecran === "arrivee" && (
        <Arrivee t={t} langue={langue} pays={pays} onPostuler={() => aller("candidature")}
          faq={<Faq t={t} onContrat={() => aller("modele")} onPrivacy={() => aller("privacy")} />} />
      )}
      {ecran === "faq" && (
        <main className="page"><Faq t={t} onContrat={() => aller("modele")} onPrivacy={() => aller("privacy")} /></main>
      )}
      {ecran === "modele" && <Modele t={t} langue={langue} pays={pays} onPostuler={() => aller("candidature")} />}
      {ecran === "candidature" && (
        <Candidature t={t} langue={langue} pays={pays} onLegal={() => aller("privacy")} onContrat={() => aller("modele")} onEnvoye={(e) => {
          setEnvoi(e);
          aller(e.ferme ? "ferme" : "codes");
        }} />
      )}
      {ecran === "refusee" && (
        <Etat titre={t("dec.refusedTitle", { name: envoi?.prenom ?? moi?.candidature.prenom ?? "" })} texte={t("dec.refused")} />
      )}
      {ecran === "ferme" && <Etat titre={t("form.closedTitle", { name: envoi?.prenom ?? moi?.candidature.prenom ?? "" })} texte={t("form.closed")} />}
      {ecran === "expiree" && (
        <Etat titre={t("dec.expiredTitle")} texte={t("dec.expired")} action={{ texte: t("dec.applyAgain"), onClick: () => {
          garderJeton(null);
          setMoi(null);
          aller("candidature");
        } }} />
      )}
      {ecran === "codes" && envoi && <Codes t={t} envoi={envoi} onVerifie={() => aller("decision")} />}
      {ecran === "decision" && (
        <Decision t={t} langue={langue} prenom={envoi?.prenom ?? moi?.candidature.prenom ?? ""} onContrat={() => aller("contrat")} />
      )}
      {ecran === "contrat" && <Contrat t={t} langue={langue} onSigne={() => chargerMoi(true)} onExpiree={() => aller("expiree")} />}
      {ecran === "dashboard" && moi && <Dashboard t={t} langue={langue} moi={moi} onMaj={() => chargerMoi(false)} />}
      {ecran === "connexion" && <Connexion t={t} onConnecte={() => chargerMoi(true)} />}
      {(ecran === "legal" || ecran === "privacy") && <Legal t={t} section={ecran} />}

      <footer className="footer">
        <div className="wrap">
          <div className="footer__top">
            <p className="footer__tagline">{t("foot.tagline")}</p>
            <nav className="footer__liens" aria-label="Footer">
              <a href="https://vikstudios.com" rel="noopener">vikstudios.com</a>
              <a href="mailto:support@vikstudios.com">support@vikstudios.com</a>
              <button type="button" onClick={() => aller("modele")}>{t("foot.contract")}</button>
              <button type="button" onClick={() => aller("faq")}>{t("foot.faq")}</button>
              <button type="button" onClick={() => aller("privacy")}>{t("foot.privacy")}</button>
              <button type="button" onClick={() => aller("legal")}>{t("foot.legal")}</button>
            </nav>
          </div>
          <div className="footer__bas">
            <Logo onClick={() => aller(connecte ? "dashboard" : "arrivee")} />
            <span>{t("foot.rights", { year: new Date().getFullYear() })}</span>
          </div>
        </div>
      </footer>
    </>
  );
}
