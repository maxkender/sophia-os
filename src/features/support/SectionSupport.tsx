import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { lireAujourdhui } from "@/features/auto/aujourdhui/api";
import { chercherPosteurs, type PosteurTrouve, simuler } from "@/features/bot/api";
import { CatalogueComplet } from "@/features/bot/CatalogueComplet";
import { Consignes } from "@/features/bot/Consignes";
import { Documents } from "@/features/bot/Documents";
import { Exemples } from "@/features/bot/Exemples";
import { Suivi, Tester, Tests } from "@/features/bot/PageBot";
import { Regles } from "@/features/bot/Regles";

import { PageHelp } from "./PageHelp";
import { PageSupport } from "./PageSupport";

type OngletSupport = "boite" | "apercu" | "tester" | "consignes" | "regles" | "catalogue" | "documents" | "exemples" | "tests" | "suivi";
const ONGLETS_SUPPORT: readonly { cle: OngletSupport; contenu: string }[] = [
  { cle: "boite", contenu: "Boîte" },
  { cle: "apercu", contenu: "Aperçu" },
  { cle: "tester", contenu: "Tester" },
  { cle: "consignes", contenu: "Consignes" },
  { cle: "regles", contenu: "Règles" },
  { cle: "catalogue", contenu: "Catalogue" },
  { cle: "documents", contenu: "Documents" },
  { cle: "exemples", contenu: "Exemples" },
  { cle: "tests", contenu: "Tests" },
  { cle: "suivi", contenu: "Suivi" },
];

/**
 * 12/11 (OS clair) : « Support », une seule section pour tout ce qui touche aux demandes des
 * posteurs et au bot. L'onglet est dans l'adresse (?onglet=tester) : un lien mène au bon endroit.
 */
export function SectionSupport() {
  const [params, setParams] = useSearchParams();
  const brut = params.get("onglet");
  const onglet: OngletSupport = ONGLETS_SUPPORT.some((o) => o.cle === brut) ? (brut as OngletSupport) : "boite";
  const choisir = (o: OngletSupport) => {
    const p = new URLSearchParams(params);
    p.set("onglet", o);
    setParams(p, { replace: true });
  };
  return (
    <div className="space-y-4" data-testid="section-support">
      <div className="-mx-1 overflow-x-auto px-1">
        <Segments libelle="Onglets du support" options={ONGLETS_SUPPORT} actif={onglet} onChange={choisir} className="flex-nowrap whitespace-nowrap" />
      </div>
      {onglet === "boite" && <Boite />}
      {onglet === "apercu" && <ApercuPosteur />}
      {onglet === "tester" && <Tester />}
      {onglet === "consignes" && <Consignes />}
      {onglet === "regles" && <Regles />}
      {onglet === "catalogue" && <CatalogueComplet />}
      {onglet === "documents" && <Documents />}
      {onglet === "exemples" && <Exemples />}
      {onglet === "tests" && <Tests />}
      {onglet === "suivi" && <Suivi />}
    </div>
  );
}

/**
 * La Boîte : les demandes que l'OS n'a pas su régler, en une seule liste (12/11, Max : lui seul la
 * traite). La paie passe en premier, en rouge. Un vrai problème technique part en ticket à l'OS.
 */
function Boite() {
  const chiffres = useQuery({ queryKey: ["os", "aujourdhui"], queryFn: lireAujourdhui, refetchInterval: 60_000 });
  const paie = chiffres.data?.pour_max ?? 0;
  const total = paie + (chiffres.data?.pour_adrien ?? 0);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3" data-testid="boite-total">
        <span className="block text-xs text-muted-foreground">À traiter</span>
        <span className="text-3xl font-semibold">{total}</span>
        {paie > 0 && <span className="ml-2 text-sm font-medium text-destructive">dont {paie} paie</span>}
      </div>
      <PageSupport />
    </div>
  );
}

/** Aperçu posteur : la page Help exacte d'un posteur réel ou d'un faux profil Upwork / Ruul. */
function ApercuPosteur() {
  const [mode, setMode] = React.useState<"vrai" | "upwork" | "ruul">("upwork");
  const [recherche, setRecherche] = React.useState("");
  const [posteur, setPosteur] = React.useState<PosteurTrouve | null>(null);
  const trouves = useQuery({ queryKey: ["bot", "posteurs", recherche], queryFn: () => chercherPosteurs(recherche), enabled: mode === "vrai" && recherche.trim().length >= 2 });
  const plateforme = mode === "vrai" ? posteur?.plateforme ?? "upwork" : mode;
  const pret = mode !== "vrai" || !!posteur;
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 p-4">
          <Segments libelle="Quel posteur" actif={mode} onChange={(m) => { setMode(m); setPosteur(null); }}
            options={[{ cle: "upwork", contenu: "Faux profil Upwork" }, { cle: "ruul", contenu: "Faux profil Ruul" }, { cle: "vrai", contenu: "Vrai posteur" }]} />
          {mode === "vrai" && (
            posteur ? (
              <p className="text-sm">Vu comme <b>{posteur.nom}</b> ({posteur.plateforme === "ruul" ? "Ruul" : "Upwork"}) ·{" "}
                <button type="button" className="underline" onClick={() => setPosteur(null)}>changer</button></p>
            ) : (
              <div className="space-y-1">
                <Input aria-label="Chercher un posteur" placeholder="Prénom, nom ou email" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
                {(trouves.data ?? []).map((p) => (
                  <Button key={p.id} variant="outline" size="sm" className="mr-1" onClick={() => setPosteur(p)}>
                    {p.nom} · {p.plateforme === "ruul" ? "Ruul" : "Upwork"}
                  </Button>
                ))}
              </div>
            )
          )}
          <p className="text-xs text-muted-foreground">Aperçu en lecture seule : une question passe par le bot en simulation, rien n'est envoyé ni écrit.</p>
        </CardContent>
      </Card>
      {pret && (
        <div className="rounded-xl border-2 border-dashed p-3" data-testid="apercu-help">
          <PageHelp
            key={`${mode}-${posteur?.id ?? ""}`}
            apercu={{
              cle: `${mode}-${posteur?.id ?? ""}`,
              posterId: mode === "vrai" ? posteur!.id : null,
              plateforme,
              simuler: async (texte) => {
                const r = await simuler({
                  message: texte, source: "help", poster_id: mode === "vrai" ? posteur!.id : null,
                  profil: mode === "vrai" ? null : { plateforme, zone: "A", etape: "posting", statut: "actif", prenom: "Alex" },
                });
                return { reponse: r.texte, envoye_equipe: r.decision.niveau !== "bot" };
              },
            }}
          />
        </div>
      )}
    </div>
  );
}
