import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import {
  aujourdhui,
  lancerAssignation,
  lancerExtraction,
  lancerPreparation,
  listerComptes,
} from "./api";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Bornes de sécurité : un slideshow ne fait jamais autant d'étapes. */
const MAX_PREPARATION = 30;
const MAX_COMPOSITION = 10;

/**
 * Déroule toute la chaîne sur un seul compte, du scrape au post fini, en
 * pilotant les étapes depuis le navigateur.
 *
 * L'orchestration est ici et non côté serveur parce qu'une Edge Function ne
 * tient pas la chaîne entière : chaque étape est un appel court, enchaîné.
 */
export function TestCompletCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const comptes = useQuery({ queryKey: ["comptes"], queryFn: listerComptes });

  const [compteId, setCompteId] = React.useState("");
  const [avecExtraction, setAvecExtraction] = React.useState(false);
  const [type, setType] = React.useState("");
  const [typeProduit, setTypeProduit] = React.useState<string | null>(null);
  const [etape, setEtape] = React.useState<string | null>(null);
  // Progression 0-100 : chaque phase connue avance la barre d'un cran, la
  // composition la pousse pas à pas vers 95 % jusqu'au post fini (100 %).
  const [prog, setProg] = React.useState(0);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [postId, setPostId] = React.useState<string | null>(null);

  async function lancer() {
    setErreur(null);
    setPostId(null);
    setTypeProduit(null);
    setProg(8);

    try {
      const compte = comptes.data?.find((c) => c.id === compteId);
      if (!compte) throw new Error(t("test.choisirCompte"));

      if (avecExtraction && compte.compte_reference_id) {
        setEtape(t("test.extraction"));
        setProg(20);
        await lancerExtraction(compte.compte_reference_id);
      }

      // On prépare jusqu'à obtenir un sujet prêt POUR CE COMPTE de référence
      // (et pas n'importe lequel : d'autres comptes peuvent en avoir, ça ne sert
      // à rien pour celui-ci). On cible les sujets de sa référence, un par un.
      const refId = compte.compte_reference_id;
      if (!refId) throw new Error(t("test.pasDeReference"));

      setEtape(t("test.preparation"));
      setProg(40);
      for (let i = 0; i < MAX_PREPARATION; i += 1) {
        const { count } = await supabase
          .from("sujets")
          .select("*", { count: "exact", head: true })
          .eq("compte_reference_id", refId)
          .eq("preparation_statut", "done")
          .in("statut", ["retenu", "utilise"]);
        if ((count ?? 0) > 0) break; // un sujet de ce compte est prêt : on avance

        // Sinon on prépare un sujet EN ATTENTE de ce compte de référence.
        const { data: aPreparer } = await supabase
          .from("sujets")
          .select("id")
          .eq("compte_reference_id", refId)
          .in("preparation_statut", ["pending", "running"])
          .limit(1);

        if (!aPreparer?.length) throw new Error(t("test.pasDeMatiere"));
        await lancerPreparation(aPreparer[0].id);
      }

      setEtape(t("test.assignation"));
      setProg(62);
      const assignation = await lancerAssignation(compteId, type || undefined, true);
      // Le type réellement produit peut différer du type demandé : sans
      // historique, un recopiage devient un nouveau.
      setTypeProduit(assignation.resultats?.[0]?.types?.[0] ?? null);

      // Le post créé est une coquille : on la remplit pas à pas.
      setEtape(t("test.composition"));
      let dernier: string | null = null;
      for (let i = 0; i < MAX_COMPOSITION; i += 1) {
        // La composition avance par petits pas : on pousse la barre de 78 vers
        // 96 sans jamais toucher 100 avant le post réellement fini.
        setProg(Math.min(96, 78 + i * 3));
        const { data } = await supabase
          .from("posts")
          .select("id, pipeline_statut")
          .eq("compte_id", compteId)
          .eq("date_publication_prevue", aujourdhui())
          .order("created_at", { ascending: false })
          .limit(1);

        const post = data?.[0];
        if (!post) break;
        dernier = post.id;
        if (post.pipeline_statut === "done") break;
        if (post.pipeline_statut === "failed") throw new Error(t("test.echecPipeline"));

        await supabase.functions.invoke("composition", { body: { postId: post.id } });
      }

      if (!dernier) throw new Error(t("test.aucunPost"));
      setProg(100);
      setPostId(dernier);
      setEtape(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setEtape(null);
      setProg(0);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" />
          {t("test.title")}
        </CardTitle>
        <CardDescription>{t("test.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="testCompte">{t("test.compte")}</Label>
          <select
            id="testCompte"
            className={selectClass}
            value={compteId}
            onChange={(e) => setCompteId(e.target.value)}
          >
            <option value="">{t("common.none")}</option>
            {comptes.data?.map((c) => {
              const nom = c.persona_nom ?? c.handle_tiktok ?? c.id.slice(0, 8);
              return (
                <option key={c.id} value={c.id}>
                  {nom}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-muted-foreground">{t("test.compteAide")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="testType">{t("test.type")}</Label>
          <select
            id="testType"
            className={selectClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">{t("test.typeAuto")}</option>
            <option value="recycle">{t("type.recycle")}</option>
            <option value="remanie">{t("type.remanie")}</option>
            <option value="nouveau">{t("type.nouveau")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t("test.typeHint")}</p>
          {(type === "nouveau" || type === "remanie" || type === "recycle") && (
            <button
              type="button"
              onClick={() => navigate("/admin/prompts")}
              className="text-xs font-medium text-primary underline underline-offset-2"
            >
              {t("test.editerConsignes")}
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={avecExtraction}
            onChange={(e) => setAvecExtraction(e.target.checked)}
          />
          {t("test.avecExtraction")}
        </label>

        <Button disabled={!compteId || etape !== null} onClick={lancer}>
          {etape ? t("pilotage.running") : t("test.lancer")}
        </Button>

        {etape && (
          <div className="space-y-1.5">
            <p className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                {etape}
              </span>
              <span className="tabular-nums">{Math.round(prog)}%</span>
            </p>
            <Progress value={prog} />
          </div>
        )}
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
        {typeProduit && typeProduit.includes("→") && (
          <p className="text-sm text-warning">
            {t("test.repli", { type: typeProduit.split("→")[0] })}
          </p>
        )}
        {postId && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-success">
              {t("test.termine")}
              {typeProduit ? ` (${typeProduit})` : ""}
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate(`/admin/posts/${postId}`)}>
              {t("test.voir")}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("test.cout")}</p>
      </CardContent>
    </Card>
  );
}
