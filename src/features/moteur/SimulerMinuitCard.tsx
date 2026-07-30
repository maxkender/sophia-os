import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, Loader2, Moon, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  aujourdhui,
  avancerUnPost,
  lancerAssignationJour,
  postsDuJour,
} from "./api";

type Ligne = { id: string; statut: string; nom: string };

// Chaque post demande quelques étapes (traduction, Sophia) ; on borne pour ne
// pas boucler à l'infini si un post reste bloqué.
const MAX_PASSAGES = 40;

function IconeStatut({ statut }: { statut: string }) {
  if (statut === "done") return <CheckCircle2 className="size-4 text-success" />;
  if (statut === "failed") return <XCircle className="size-4 text-destructive" />;
  if (statut === "running") return <Loader2 className="size-4 animate-spin text-primary" />;
  return <Clock className="size-4 text-muted-foreground" />;
}

export function SimulerMinuitCard() {
  const { t } = useTranslation();
  const [date, setDate] = React.useState(aujourdhui());
  const [lignes, setLignes] = React.useState<Ligne[]>([]);
  const [etape, setEtape] = React.useState<string | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);

  const enCours = etape !== null;
  const prets = lignes.filter((l) => l.statut === "done").length;
  const total = lignes.length;

  async function lancer() {
    setErreur(null);
    setLignes([]);
    try {
      // Assignation v-next (labels ∩ score → passages + posts déjà cuits).
      // On retente une fois si ça hoquette, puis on affiche ce qui existe.
      setEtape(t("simMinuit.assignation"));
      try {
        await lancerAssignationJour(date);
      } catch {
        try {
          await lancerAssignationJour(date);
        } catch {
          // on poursuit avec ce qui a été créé
        }
      }

      setEtape(t("simMinuit.fabrication"));
      let posts = await postsDuJour(date);
      if (posts.length === 0) {
        setErreur(t("simMinuit.aucun"));
        setEtape(null);
        return;
      }
      setLignes(posts);

      // Filet : si d'anciens posts legacy sont encore en pending, on les avance.
      for (let i = 0; i < MAX_PASSAGES; i += 1) {
        const aFaire = posts.filter((p) => p.statut !== "done" && p.statut !== "failed");
        if (aFaire.length === 0) break;
        await Promise.all(aFaire.map((p) => avancerUnPost(p.id).catch(() => null)));
        posts = await postsDuJour(date);
        setLignes(posts);
      }

      setEtape(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setEtape(null);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="size-4 text-primary" />
          {t("simMinuit.title")}
        </CardTitle>
        <CardDescription>{t("simMinuit.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="simDate">{t("simMinuit.date")}</Label>
            <Input
              id="simDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <Button disabled={enCours} onClick={lancer}>
            <Moon className="size-4" />
            {enCours ? t("simMinuit.enCours") : t("simMinuit.lancer")}
          </Button>
        </div>

        {etape && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            {etape} {total > 0 && `· ${prets}/${total} ${t("simMinuit.prets")}`}
          </p>
        )}
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}

        {lignes.length > 0 && (
          <div className="space-y-1.5">
            {total > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(prets / total) * 100}%` }}
                />
              </div>
            )}
            {lignes.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <IconeStatut statut={l.statut} />
                  <span className="truncate">{l.nom}</span>
                </div>
                {l.statut === "done" ? (
                  <Link
                    to={`/posts/${l.id}`}
                    className="shrink-0 text-xs font-medium text-primary underline underline-offset-2"
                  >
                    {t("simMinuit.voir")}
                  </Link>
                ) : (
                  <span className={cn("shrink-0 text-xs text-muted-foreground")}>
                    {t(`simMinuit.etat.${l.statut}`, l.statut)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("simMinuit.cout")}</p>
      </CardContent>
    </Card>
  );
}
