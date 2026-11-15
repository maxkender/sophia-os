import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Swords } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableDuel } from "@/features/abTraduction/TableDuel";
import { cn } from "@/lib/utils";

import { compterMots, type CoteDuel, coteDepuisNotes, type DuelRelecteur, mesDuelsRelecteur, MOTS_MIN_REMARQUE, voterDuelRelecteur } from "./api";
import { messageErreur } from "./messageErreur";
import { Etoiles, TuileIcone } from "./Puces";

export const CLE_REQUETE_MES_DUELS = ["mes-duels-relecteur"] as const;

/**
 * Les duels à l'aveugle envoyés au relecteur (0626) : deux versions d'un même
 * slideshow dans sa langue, sans la source et sans dire laquelle est partie.
 * Un duel à la fois : il note chaque version de 1 à 5 (la mieux notée gagne,
 * même note = égal) et laisse une remarque d'au moins 50 mots, une par
 * slideshow, qui vaut pour les deux versions. Les côtés ne lui sont jamais
 * révélés : le serveur traduit son vote en version.
 */
export function DuelsRelecteur({ langue }: { langue: string }) {
  const { t } = useTranslation();
  const duels = useQuery({ queryKey: CLE_REQUETE_MES_DUELS, queryFn: mesDuelsRelecteur });

  if (duels.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (duels.error) return <p className="text-sm text-destructive">{messageErreur(duels.error)}</p>;

  const liste = (duels.data ?? []).filter((d) => d.langue.toLowerCase() === langue.toLowerCase());
  const aVoter = liste.filter((d) => !d.mon_cote);
  const votes = liste.filter((d) => d.mon_cote);
  const courant = aVoter[0];

  return (
    <div className="space-y-4" data-testid="duels-relecteur">
      <div className="flex items-start gap-4">
        <TuileIcone icone={Swords} ton="violet" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold">{t("relectureNative.poster.duels.titre")}</p>
          <p className="text-sm text-muted-foreground">{t("relectureNative.poster.duels.aide")}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {(["principe1", "principe2", "principe3", "principe4"] as const).map((k) => (
              <li key={k}>{t(`relectureNative.poster.duels.${k}`)}</li>
            ))}
          </ol>
        </div>
      </div>

      {!courant ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground" data-testid="duels-vide">
          {votes.length === 0 ? t("relectureNative.poster.duels.aucun") : t("relectureNative.poster.duels.tousVotes", { n: votes.length })}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="info" data-testid="duel-progression">
              {t("relectureNative.poster.duels.progression", { k: votes.length + 1, n: liste.length })}
            </Badge>
            <span className="text-muted-foreground">{t("relectureNative.poster.duels.unALaFois")}</span>
          </div>
          <CarteDuelRelecteur key={courant.duel_id} duel={courant} />
        </>
      )}

      {votes.length > 0 && (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("relectureNative.poster.duels.votes", { n: votes.length })}
          </summary>
          <div className="mt-3 space-y-4">
            {votes.map((d) => (
              <CarteDuelRelecteur key={d.duel_id} duel={d} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CarteDuelRelecteur({ duel }: { duel: DuelRelecteur }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [edition, setEdition] = React.useState(!duel.mon_cote);
  const [noteGauche, setNoteGauche] = React.useState<number | null>(duel.ma_note_gauche);
  const [noteDroite, setNoteDroite] = React.useState<number | null>(duel.ma_note_droite);
  const [remarque, setRemarque] = React.useState(duel.ma_remarque ?? "");

  const cote = coteDepuisNotes(noteGauche, noteDroite);
  const mots = compterMots(remarque);
  const complet = cote != null && mots >= MOTS_MIN_REMARQUE;

  const voter = useMutation({
    mutationFn: () =>
      voterDuelRelecteur(duel.duel_id, {
        cote: cote!,
        noteGauche,
        noteDroite,
        remarque,
        remarqueSur: "les_deux",
        typeErreur: null,
      }),
    onSuccess: () => {
      setEdition(false);
      void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_MES_DUELS });
    },
  });

  const v1 = t("relectureNative.poster.duels.version1");
  const v2 = t("relectureNative.poster.duels.version2");
  const nomCote = (c: CoteDuel) => (c === "gauche" ? v1 : c === "droite" ? v2 : t("relectureNative.poster.duels.egal"));

  return (
    <Card data-testid="duel-relecteur">
      <CardPanel className="space-y-4">
        <TableDuel gauche={duel.deck_gauche} droite={duel.deck_droite} titreGauche={v1} titreDroite={v2} />

        {!edition && duel.mon_cote ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="success">
              <Check className="size-3" aria-hidden />
              {t("relectureNative.poster.duels.monVote", { choix: nomCote(duel.mon_cote) })}
            </Badge>
            {(duel.ma_note_gauche != null || duel.ma_note_droite != null) && (
              <span className="text-muted-foreground">
                {t("relectureNative.poster.duels.mesNotes", { v1: duel.ma_note_gauche ?? "—", v2: duel.ma_note_droite ?? "—" })}
              </span>
            )}
            {duel.ma_remarque && <span className="text-muted-foreground">· {duel.ma_remarque}</span>}
            <Button size="xs" variant="ghost" onClick={() => setEdition(true)}>
              {t("relectureNative.poster.duels.changer")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Etoiles libelle={t("relectureNative.poster.duels.noter", { version: v1 })} valeur={noteGauche} onChange={setNoteGauche} />
              <Etoiles libelle={t("relectureNative.poster.duels.noter", { version: v2 })} valeur={noteDroite} onChange={setNoteDroite} />
            </div>
            {cote && (
              <p className="text-sm" data-testid="duel-verdict">
                {t("relectureNative.poster.duels.verdict", { choix: nomCote(cote) })}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor={`remarque-${duel.duel_id}`}>{t("relectureNative.poster.duels.remarque")}</Label>
              <Textarea
                id={`remarque-${duel.duel_id}`}
                rows={4}
                required
                placeholder={t("relectureNative.poster.duels.remarqueAide")}
                value={remarque}
                onChange={(e) => setRemarque(e.target.value)}
              />
              <p className={cn("text-xs", mots >= MOTS_MIN_REMARQUE ? "text-muted-foreground" : "text-warning-foreground")} data-testid="duel-mots">
                {t("relectureNative.poster.duels.mots", { n: mots, min: MOTS_MIN_REMARQUE })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={!complet || voter.isPending} onClick={() => voter.mutate()}>
                {voter.isPending ? t("common.loading") : t("relectureNative.poster.duels.envoyer")}
              </Button>
              {!complet && <p className="text-xs text-muted-foreground">{t("relectureNative.poster.duels.pourEnvoyer", { min: MOTS_MIN_REMARQUE })}</p>}
              {duel.mon_cote && (
                <Button size="sm" variant="ghost" onClick={() => setEdition(false)}>
                  {t("common.cancel")}
                </Button>
              )}
              {voter.error && (
                <p role="alert" className="text-xs text-destructive">
                  {messageErreur(voter.error)}
                </p>
              )}
            </div>
          </div>
        )}
      </CardPanel>
    </Card>
  );
}
