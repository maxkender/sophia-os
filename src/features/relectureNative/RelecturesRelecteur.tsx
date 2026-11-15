import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, FileCheck, PenLine, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { compterMots, mesRelectures, MOTS_MIN_RELECTURE, relirePost, type RelecturePoste } from "./api";
import { messageErreur } from "./messageErreur";
import { Etoiles, TuileIcone } from "./Puces";

export const CLE_REQUETE_MES_RELECTURES = ["mes-relectures"] as const;

/**
 * La relecture simple (0631) : les slideshows publiés dans la langue du
 * relecteur, tels qu'ils sont partis, un à la fois. Il réécrit les slides
 * qu'il aurait écrites autrement, note l'ensemble sur 5 et laisse une
 * remarque (30 mots au moins s'il n'a rien réécrit). Pas de source, pas de
 * duel. Ses réécritures et sa remarque entrent dans la boucle de correction.
 */
export function RelecturesRelecteur({ langue }: { langue: string }) {
  const { t } = useTranslation();
  const relectures = useQuery({ queryKey: CLE_REQUETE_MES_RELECTURES, queryFn: mesRelectures });

  if (relectures.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (relectures.error) return <p className="text-sm text-destructive">{messageErreur(relectures.error)}</p>;

  const liste = (relectures.data ?? []).filter((r) => r.langue.toLowerCase() === langue.toLowerCase());
  const aFaire = liste.filter((r) => r.statut !== "faite");
  const faites = liste.filter((r) => r.statut === "faite");
  const courante = aFaire[0];

  return (
    <div className="space-y-4" data-testid="relectures-relecteur">
      <div className="flex items-start gap-4">
        <TuileIcone icone={FileCheck} ton="vert" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold">{t("relectureNative.poster.relectures.titre")}</p>
          <p className="text-sm text-muted-foreground">{t("relectureNative.poster.relectures.aide")}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {(["principe1", "principe2", "principe3"] as const).map((k) => (
              <li key={k}>{t(`relectureNative.poster.relectures.${k}`, { min: MOTS_MIN_RELECTURE })}</li>
            ))}
          </ol>
        </div>
      </div>

      {!courante ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground" data-testid="relectures-vide">
          {faites.length === 0
            ? t("relectureNative.poster.relectures.aucune")
            : t("relectureNative.poster.relectures.toutesFaites", { n: faites.length })}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" data-testid="relecture-progression">
              {t("relectureNative.poster.relectures.progression", { n: faites.length + 1, total: liste.length })}
            </Badge>
            <span className="text-xs text-muted-foreground">{t("relectureNative.poster.relectures.suivante")}</span>
          </div>
          <CarteRelecture key={courante.id} relecture={courante} />
        </>
      )}
    </div>
  );
}

function CarteRelecture({ relecture }: { relecture: RelecturePoste }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const slides = [...relecture.slides].sort((a, b) => a.position - b.position);
  const [reecrites, setReecrites] = React.useState<Record<number, string>>({});
  const [note, setNote] = React.useState<number | null>(null);
  const [remarque, setRemarque] = React.useState("");

  const changements = slides
    .filter((s) => reecrites[s.position] != null && reecrites[s.position].trim() && reecrites[s.position].trim() !== (s.texte_overlay ?? "").trim())
    .map((s) => ({ position: s.position, texte: reecrites[s.position].trim() }));
  const mots = compterMots(remarque);
  const complet = note != null && (changements.length > 0 || mots >= MOTS_MIN_RELECTURE);

  const envoyer = useMutation({
    mutationFn: () => relirePost(relecture.id, { note: note!, remarque, slides: changements }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_MES_RELECTURES }),
  });

  return (
    <Card data-testid="relecture-poste">
      <CardPanel className="space-y-4">
        <ol className="space-y-2" data-testid="relecture-slides">
          {slides.map((s) => {
            const enCours = reecrites[s.position] != null;
            return (
              <li key={s.position} className="rounded-lg border p-3" data-testid="relecture-slide" data-position={s.position}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("relectureNative.poster.relectures.slide", { n: s.position })}</span>
                  {s.position_sophia && <Badge variant="secondary">{t("relectureNative.poster.relectures.slideAppli")}</Badge>}
                  {!enCours ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => setReecrites({ ...reecrites, [s.position]: s.texte_overlay ?? "" })}
                      aria-label={t("relectureNative.poster.relectures.reecrireLabel", { n: s.position })}
                    >
                      <PenLine />
                      {t("relectureNative.poster.relectures.reecrire")}
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => {
                        const copie = { ...reecrites };
                        delete copie[s.position];
                        setReecrites(copie);
                      }}
                    >
                      <Undo2 />
                      {t("relectureNative.poster.relectures.garder")}
                    </Button>
                  )}
                </div>
                <p className={cn("mt-1 text-sm whitespace-pre-wrap", enCours && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                  {(s.texte_overlay ?? "").trim() || t("relectureNative.poster.relectures.slideVide")}
                </p>
                {enCours && (
                  <Textarea
                    rows={3}
                    className="mt-2"
                    aria-label={t("relectureNative.poster.relectures.reecrireLabel", { n: s.position })}
                    value={reecrites[s.position]}
                    onChange={(e) => setReecrites({ ...reecrites, [s.position]: e.target.value })}
                  />
                )}
              </li>
            );
          })}
        </ol>

        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <Etoiles libelle={t("relectureNative.poster.relectures.noter")} valeur={note} onChange={setNote} />
          <div className="space-y-1">
            <Label htmlFor={`remarque-${relecture.id}`}>{t("relectureNative.poster.relectures.remarque")}</Label>
            <Textarea
              id={`remarque-${relecture.id}`}
              rows={3}
              placeholder={t("relectureNative.poster.relectures.remarquePlaceholder")}
              value={remarque}
              onChange={(e) => setRemarque(e.target.value)}
            />
            <p className={cn("text-xs", changements.length > 0 || mots >= MOTS_MIN_RELECTURE ? "text-muted-foreground" : "text-warning-foreground")} data-testid="relecture-mots">
              {changements.length > 0
                ? t("relectureNative.poster.relectures.slidesReecrites", { count: changements.length })
                : t("relectureNative.poster.relectures.mots", { n: mots, min: MOTS_MIN_RELECTURE })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!complet || envoyer.isPending} onClick={() => envoyer.mutate()}>
            <Check />
            {envoyer.isPending ? t("common.saving") : t("relectureNative.poster.relectures.envoyer")}
          </Button>
          {!complet && <p className="text-xs text-muted-foreground">{t("relectureNative.poster.relectures.pourEnvoyer", { min: MOTS_MIN_RELECTURE })}</p>}
          {envoyer.isError && (
            <p role="alert" className="text-xs text-destructive">
              {messageErreur(envoyer.error)}
            </p>
          )}
        </div>
      </CardPanel>
    </Card>
  );
}
