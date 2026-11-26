import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { appeler, capterSource, garderJeton, lireJeton, type Moi, type PaysPaie } from "./api";
import { chargerLangue, estRtl, langueChargee, langueInitiale, LANGUES, traducteur } from "./i18n";
import { Logo } from "./Logo";
import Arrivee from "./pages/Arrivee";
import { effacerBrouillon } from "./brouillon";
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
import Presentation from "./pages/Presentation";
import { marquerPresentationVue, NB_ECRANS, presentationVue } from "./presentation";

type Ecran =
  | "arrivee" | "candidature" | "ferme" | "codes" | "decision" | "contrat" | "dashboard" | "connexion" | "legal" | "privacy"
  | "expiree" | "refusee" | "arretee" | "modele" | "faq" | "presentation";

/** Les pages publiques qui ont leur propre adresse (liens partageables) ; /admin est à part. */
const CHEMINS: Partial<Record<Ecran, string>> = { modele: "/contract", legal: "/legal", privacy: "/privacy", faq: "/faq" };

/**
 * 25/11 : chaque écran (et chaque écran de la présentation) a son entrée dans l'historique, pour que le bouton
 * « retour » du téléphone revienne à l'écran d'avant au lieu de quitter le site.
 */
type EtatHistorique = { ecran: Ecran; onb?: number };

/** Les écrans du parcours d'un candidat connecté : jamais restaurés tels quels (la session décide, via `moi`). */
const ECRANS_SESSION: readonly Ecran[] = ["codes", "decision", "contrat", "dashboard", "expiree", "refusee", "arretee", "ferme"];

function ecranDuChemin(): Ecran | null {
  const p = location.pathname.replace(/\/+$/, "") || "/";
  return (Object.entries(CHEMINS).find(([, c]) => c === p)?.[0] as Ecran | undefined) ?? null;
}

function etatHistorique(): EtatHistorique | null {
  try {
    const s = history.state as EtatHistorique | null;
    return s && typeof s === "object" && typeof s.ecran === "string" ? s : null;
  } catch {
    return null;
  }
}

/** L'écran au chargement : l'adresse (/contract…), sinon la présentation ou le formulaire en cours (rechargement). */
function ecranInitial(): { ecran: Ecran; onb: number } {
  const chemin = ecranDuChemin();
  if (chemin) return { ecran: chemin, onb: 1 };
  const s = etatHistorique();
  if (s && (s.ecran === "presentation" || s.ecran === "candidature")) return { ecran: s.ecran, onb: s.onb ?? 1 };
  return { ecran: "arrivee", onb: 1 };
}

/** Un onglet ouvert par un lien du site (même origine) : ce n'est pas une nouvelle visite. */
function ouvertDepuisLeSite(): boolean {
  try {
    return !!document.referrer && new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
}

export default function App() {
  if (location.pathname.replace(/\/+$/, "") === "/admin") return <Admin />;
  return <Site />;
}

function Site() {
  const [langue, setLangueAffichee] = useState(langueInitiale);
  /** Changer de langue : le fichier de la langue est chargé d'abord, puis la page bascule d'un coup. */
  const setLangue = (code: string) => {
    if (langueChargee(code)) return setLangueAffichee(code);
    chargerLangue(code).then(() => setLangueAffichee(code));
  };
  const t = useMemo(() => traducteur(langue), [langue]);
  const depart = useRef(ecranInitial()).current;
  const [ecran, setEcran] = useState<Ecran>(depart.ecran);
  const [onb, setOnb] = useState(depart.onb);
  // 26/11 : pas de bandeau « mode test » tant que le mode n'est pas lu (avant : affiché par défaut, même en live).
  const [mode, setMode] = useState("");
  const [pays, setPays] = useState<PaysPaie[]>([]);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [moi, setMoi] = useState<Moi | null>(null);

  /** Aller à un écran : une nouvelle entrée d'historique, ou à la place de l'actuelle (étapes du parcours). */
  const aller = useCallback((e: Ecran, o: { onb?: number; remplacer?: boolean } = {}) => {
    const etape = o.onb ?? 1;
    setEcran(e);
    setOnb(etape);
    const etat: EtatHistorique = { ecran: e, onb: etape };
    try {
      const url = `${CHEMINS[e] ?? "/"}${location.search}`;
      if (o.remplacer) history.replaceState(etat, "", url);
      else history.pushState(etat, "", url);
    } catch {
      // historique indisponible
    }
    globalThis.scrollTo(0, 0);
  }, []);

  /** « Postuler » : la présentation d'abord (une fois par session), puis le formulaire. */
  const postuler = () => aller(presentationVue() ? "candidature" : "presentation");
  const finirPresentation = () => {
    marquerPresentationVue();
    aller("candidature");
  };

  const chargerMoi = useCallback(async (orienter: boolean) => {
    if (!lireJeton()) {
      if (orienter) aller("arrivee", { remplacer: true });
      return;
    }
    const r = await appeler<Moi>("moi");
    if (!r.ok) {
      if (r.error === "session") {
        garderJeton(null);
        if (orienter) aller("arrivee", { remplacer: true });
      }
      return;
    }
    setMoi(r);
    if (!orienter) return;
    const c = r.candidature;
    setEnvoi((e) => e ?? { prenom: c.prenom, email: c.email, whatsapp: c.whatsapp, whatsapp_code: c.whatsapp_code });
    // Les étapes du parcours remplacent l'entrée courante : « retour » ne ramène jamais sur un écran périmé.
    const vers = (e: Ecran) => aller(e, { remplacer: true });
    // 26/11 (Max) : un posteur que l'OS a arrêté (set-up pas fini en 14 jours, Kill, arrêt) voit un état clair, plus la checklist.
    if (r.signature) vers(r.arretee ? "arretee" : "dashboard");
    else if (r.expiree) vers("expiree");
    else if (c.ferme) vers("ferme");
    else if (c.decision === "refusee") vers("refusee");
    // 25/11 : un candidat accepté qui revient voit d'abord « Tu es accepté·e » et sa date limite, puis le contrat.
    else if (c.decision === "auto" || c.decision === "a_traiter" || (c.email_verifie && c.whatsapp_verifie)) vers("decision");
    else vers("codes");
  }, [aller]);

  useEffect(() => {
    // L'écran de départ devient l'entrée courante de l'historique (le « retour » y revient).
    try {
      history.replaceState({ ecran: depart.ecran, onb: depart.onb } satisfies EtatHistorique, "");
    } catch {
      // historique indisponible
    }
    const retour = (ev: PopStateEvent) => {
      const s = (ev.state as EtatHistorique | null) ?? null;
      const e = s?.ecran ?? ecranDuChemin() ?? "arrivee";
      // Un écran du parcours (codes, contrat…) : la session dit où en est le candidat.
      if (ECRANS_SESSION.includes(e)) {
        chargerMoi(true);
        return;
      }
      setEcran(e);
      setOnb(Math.min(Math.max(s?.onb ?? 1, 1), NB_ECRANS));
      globalThis.scrollTo(0, 0);
    };
    addEventListener("popstate", retour);
    return () => removeEventListener("popstate", retour);
  }, [chargerMoi, depart]);

  useEffect(() => {
    document.documentElement.lang = langue;
    document.documentElement.dir = estRtl(langue) ? "rtl" : "ltr";
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
    // 25/11 : une visite par session (sessionStorage), jamais pour un candidat qui revient avec sa session, ni pour un
    // onglet ouvert depuis le site lui-même (contrat, confidentialité, FAQ : nouvel onglet = nouvelle session).
    try {
      if (!sessionStorage.getItem("join_visite")) {
        sessionStorage.setItem("join_visite", "1");
        if (!lireJeton() && !ouvertDepuisLeSite()) {
          const p = new URLSearchParams(location.search);
          appeler("visite", { langue: langueInitiale(), source: p.get("utm_source") ?? p.get("src") ?? (p.get("ref") ? "ref" : "") });
        }
      }
    } catch {
      // stockage indisponible : pas de visite comptée
    }
    // Une page publique ouverte par son adresse (/contract, /legal…) reste affichée, comme la présentation et le
    // formulaire en cours ; sinon la session (s'il y en a une) dit où en est le candidat.
    const publique = !!ecranDuChemin() || depart.ecran !== "arrivee";
    if (lireJeton()) chargerMoi(!publique);
  }, [chargerMoi, depart]);

  const signe = !!moi?.signature;
  /** 25/11 : connecté = une session (candidat en cours ou signé) : jamais « Se connecter » dans ce cas. */
  const enSession = !!moi || !!lireJeton();
  const deconnecter = () => {
    garderJeton(null);
    setMoi(null);
    setEnvoi(null);
    effacerBrouillon();
    aller("arrivee");
  };
  return (
    <>
      {mode === "test" && <div className="bandeau-test" role="status">{t("test.banner")}</div>}
      <header className="nav">
        <div className="wrap nav__bar">
          <Logo onClick={() => aller(signe ? "dashboard" : "arrivee")} />
          <div className="nav__right">
            <label className="lang">
              <span className="lang__nom" aria-hidden="true">
                <span className="lang__long">{LANGUES.find((l) => l.code === langue)?.nom ?? langue}</span>
                <span className="lang__court">{langue.toUpperCase()}</span>
              </span>
              <select aria-label="Language" value={langue} onChange={(e) => setLangue(e.target.value)}>
                {LANGUES.map((l) => <option key={l.code} value={l.code}>{l.nom}</option>)}
              </select>
            </label>
            {enSession ? (
              <button type="button" className="nav__link" onClick={deconnecter}>{t("nav.logout")}</button>
            ) : (
              <>
                <button type="button" className="nav__link" onClick={() => aller("connexion")}>{t("nav.login")}</button>
                {ecran === "arrivee" && (
                  <button type="button" className="btn btn--sm nav__cta" onClick={postuler}>{t("nav.apply")}</button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {ecran === "arrivee" && (
        <Arrivee t={t} langue={langue} pays={pays} onPostuler={postuler}
          faq={<Faq t={t} onContrat={() => aller("modele")} onPrivacy={() => aller("privacy")} />} />
      )}
      {ecran === "faq" && (
        <main className="page"><Faq t={t} onContrat={() => aller("modele")} onPrivacy={() => aller("privacy")} /></main>
      )}
      {ecran === "modele" && <Modele t={t} langue={langue} pays={pays} onPostuler={postuler} />}
      {ecran === "presentation" && (
        <Presentation t={t} langue={langue} pays={pays} etape={onb}
          onEtape={(n) => aller("presentation", { onb: n })} onFini={finirPresentation} />
      )}
      {ecran === "candidature" && (
        <div className="wrap etroite onb__revoir">
          <button type="button" className="lien" onClick={() => aller("presentation")}>{t("onb.replay")}</button>
        </div>
      )}
      {ecran === "candidature" && (
        <Candidature t={t} langue={langue} pays={pays} onEnvoye={(e) => {
          setEnvoi(e);
          aller(e.ferme ? "ferme" : "codes", { remplacer: true });
        }} />
      )}
      {ecran === "refusee" && (
        <Etat titre={t("dec.refusedTitle", { name: envoi?.prenom ?? moi?.candidature.prenom ?? "" })} texte={t("dec.refused")} />
      )}
      {ecran === "arretee" && <Etat titre={t("stop.title")} texte={t("stop.body")} />}
      {ecran === "ferme" && <Etat titre={t("form.closedTitle", { name: envoi?.prenom ?? moi?.candidature.prenom ?? "" })} texte={t("form.closed")} />}
      {ecran === "expiree" && (
        <Etat titre={t("dec.expiredTitle")} texte={t("dec.expired")} action={{ texte: t("dec.applyAgain"), onClick: () => {
          garderJeton(null);
          setMoi(null);
          aller("candidature");
        } }} />
      )}
      {ecran === "codes" && envoi && <Codes t={t} envoi={envoi} onVerifie={() => aller("decision", { remplacer: true })} />}
      {ecran === "decision" && (
        <Decision t={t} langue={langue} prenom={envoi?.prenom ?? moi?.candidature.prenom ?? ""}
          onContrat={() => aller("contrat")} onFaq={() => aller("faq")} />
      )}
      {ecran === "contrat" && <Contrat t={t} langue={langue} onSigne={() => chargerMoi(true)} onExpiree={() => aller("expiree", { remplacer: true })} />}
      {ecran === "dashboard" && moi && <Dashboard t={t} langue={langue} moi={moi} onMaj={() => chargerMoi(false)} />}
      {ecran === "connexion" && <Connexion t={t} onConnecte={() => chargerMoi(true)} />}
      {(ecran === "legal" || ecran === "privacy") && <Legal t={t} section={ecran} />}

      {ecran !== "presentation" && <footer className="footer">
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
            <Logo onClick={() => aller(signe ? "dashboard" : "arrivee")} />
            <span>{t("foot.rights", { year: new Date().getFullYear() })}</span>
          </div>
        </div>
      </footer>}
    </>
  );
}
