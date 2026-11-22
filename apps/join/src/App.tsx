import { useCallback, useEffect, useMemo, useState } from "react";

import { appeler, garderJeton, lireJeton, type Moi, type PaysPaie } from "./api";
import { langueInitiale, LANGUES, traducteur } from "./i18n";
import Arrivee from "./pages/Arrivee";
import Candidature, { type Envoi } from "./pages/Candidature";
import Codes from "./pages/Codes";
import Connexion from "./pages/Connexion";
import Contrat from "./pages/Contrat";
import Dashboard from "./pages/Dashboard";
import Decision from "./pages/Decision";

type Ecran = "arrivee" | "candidature" | "codes" | "decision" | "contrat" | "dashboard" | "connexion";

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
    if (r.signature) aller("dashboard");
    else if (c.decision === "auto") aller("contrat");
    else if (c.decision === "a_traiter" || (c.email_verifie && c.whatsapp_verifie)) aller("decision");
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
    appeler<{ mode: string; pays: PaysPaie[] }>("pays_et_paie").then((r) => {
      if (!r.ok) return;
      setMode(r.mode);
      setPays(r.pays);
    });
    try {
      if (!sessionStorage.getItem("join_visite")) {
        sessionStorage.setItem("join_visite", "1");
        appeler("visite", { langue: langueInitiale(), source: new URLSearchParams(location.search).get("src") ?? "" });
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
      <header className="entete">
        <button type="button" className="marque" onClick={() => aller(connecte ? "dashboard" : "arrivee")}>Vik Studios</button>
        <div className="entete-droite">
          <select aria-label="Language" value={langue} onChange={(e) => setLangue(e.target.value)}>
            {LANGUES.map((l) => <option key={l.code} value={l.code}>{l.nom}</option>)}
          </select>
          {connecte ? (
            <button type="button" className="lien" onClick={() => {
              garderJeton(null);
              setMoi(null);
              aller("arrivee");
            }}>{t("nav.logout")}</button>
          ) : (
            <button type="button" className="lien" onClick={() => aller("connexion")}>{t("nav.login")}</button>
          )}
        </div>
      </header>

      {ecran === "arrivee" && <Arrivee t={t} langue={langue} pays={pays} onPostuler={() => aller("candidature")} />}
      {ecran === "candidature" && (
        <Candidature t={t} langue={langue} pays={pays} onEnvoye={(e) => {
          setEnvoi(e);
          aller("codes");
        }} />
      )}
      {ecran === "codes" && envoi && <Codes t={t} envoi={envoi} onVerifie={() => aller("decision")} />}
      {ecran === "decision" && (
        <Decision t={t} prenom={envoi?.prenom ?? moi?.candidature.prenom ?? ""} onContrat={() => aller("contrat")} />
      )}
      {ecran === "contrat" && <Contrat t={t} onSigne={() => chargerMoi(true)} />}
      {ecran === "dashboard" && moi && <Dashboard t={t} langue={langue} moi={moi} onMaj={() => chargerMoi(false)} />}
      {ecran === "connexion" && <Connexion t={t} onConnecte={() => chargerMoi(true)} />}
    </>
  );
}
