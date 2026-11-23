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
import Decision from "./pages/Decision";
import Etat from "./pages/Etat";
import Legal from "./pages/Legal";

type Ecran = "arrivee" | "candidature" | "ferme" | "codes" | "decision" | "contrat" | "dashboard" | "connexion" | "legal" | "expiree";

export default function App() {
  const [langue, setLangue] = useState(langueInitiale);
  const t = useMemo(() => traducteur(langue), [langue]);
  const [ecran, setEcran] = useState<Ecran>("arrivee");
  const [mode, setMode] = useState("test");
  const [pays, setPays] = useState<PaysPaie[]>([]);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [moi, setMoi] = useState<Moi | null>(null);

  const aller = (e: Ecran) => {
    setEcran(e);
    globalThis.scrollTo(0, 0);
  };

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
    chargerMoi(true);
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

      {ecran === "arrivee" && <Arrivee t={t} langue={langue} pays={pays} onPostuler={() => aller("candidature")} />}
      {ecran === "candidature" && (
        <Candidature t={t} langue={langue} pays={pays} onLegal={() => aller("legal")} onEnvoye={(e) => {
          setEnvoi(e);
          aller(e.ferme ? "ferme" : "codes");
        }} />
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
      {ecran === "legal" && <Legal t={t} />}

      <footer className="footer">
        <div className="wrap">
          <div className="footer__top">
            <p className="footer__tagline">{t("foot.tagline")}</p>
            <nav className="footer__liens" aria-label="Footer">
              <a href="https://vikstudios.com" rel="noopener">vikstudios.com</a>
              <a href="mailto:support@vikstudios.com">support@vikstudios.com</a>
              <button type="button" onClick={() => aller("legal")}>{t("foot.privacy")}</button>
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
