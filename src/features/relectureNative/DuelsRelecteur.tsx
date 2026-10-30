import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Star, Swords } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableDuel } from "@/features/abTraduction/TableDuel";
import { cn } from "@/lib/utils";

import {
  type CibleRemarque,
  type CoteDuel,
  type DuelRelecteur,
  mesDuelsRelecteur,
  TYPES_ERREUR,
  type TypeErreur,
  voterDuelRelecteur,
} from "./api";
import { messageErreur } from "./messageErreur";
import { TuileIcone } from "./Puces";

export const CLE_REQUETE_MES_DUELS = ["mes-duels-relecteur"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Les duels à l'aveugle envoyés au relecteur (0626) : deux versions d'un même
 * slideshow, sans dire laquelle est partie. Il choisit la meilleure (ou égal),
 * note chaque version de 1 à 5 et peut laisser une remarque typée. Les côtés ne
 * lui sont jamais révélés : le serveur traduit son vote en version.
 */
export function DuelsRelecteur({ langue }: { langue: string }) {
  const { t } = useTranslation();
  const duels = useQuery({ queryKey: CLE_REQUETE_MES_DUELS, queryFn: mesDuelsRelecteur });

  if (duels.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (duels.error) return <p className="text-sm text-destructive">{messageErreur(duels.error)}</p>;

  const liste = (duels.data ?? []).filter((d) => d.langue.toLowerCase() === langue.toLowerCase());
  const aVoter = liste.filter((d) => !d.mon_cote);
  const votes = liste.filter((d) => d.mon_cote);

  return (
    <div className="space-y-4" data-testid="duels-relecteur">
      <div className="flex items-start gap-4">
        <TuileIcone icone={Swords} ton="violet" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{t("relectureNative.poster.duels.titre")}</p>
          <p className="text-sm text-muted-foreground">{t("relectureNative.poster.duels.aide")}</p>
        </div>
      </div>

      {aVoter.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground" data-testid="duels-vide">
          {votes.length === 0 ? t("relectureNative.poster.duels.aucun") : t("relectureNative.poster.duels.tousVotes", { n: votes.length })}
        </p>
      ) : (
        <>
          <p className="text-sm">{t("relectureNative.poster.duels.aVoter", { n: aVoter.length })}</p>
          {aVoter.map((d) => (
            <CarteDuelRelecteur key={d.duel_id} duel={d} />
          ))}
        </>
      )}

      {votes.length > 0 && aVoter.length > 0 && (
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
      {votes.length > 0 && aVoter.length === 0 && votes.map((d) => <CarteDuelRelecteur key={d.duel_id} duel={d} />)}
    </div>
  );
}

function CarteDuelRelecteur({ duel }: { duel: DuelRelecteur }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [edition, setEdition] = React.useState(!duel.mon_cote);
  const [cote, setCote] = React.useState<CoteDuel | null>(duel.mon_cote);
  const [noteGauche, setNoteGauche] = React.useState<number | null>(duel.ma_note_gauche);
  const [noteDroite, setNoteDroite] = React.useState<number | null>(duel.ma_note_droite);
  const [remarque, setRemarque] = React.useState(duel.ma_remarque ?? "");
  const [remarqueSur, setRemarqueSur] = React.useState<CibleRemarque>(duel.ma_remarque_sur ?? "les_deux");
  const [typeErreur, setTypeErreur] = React.useState<TypeErreur | "">(duel.mon_type_erreur ?? "");

  const voter = useMutation({
    mutationFn: () =>
      voterDuelRelecteur(duel.duel_id, {
        cote: cote!,
        noteGauche,
        noteDroite,
        remarque,
        remarqueSur,
        typeErreur: typeErreur || null,
      }),
    onSuccess: () => {
      setEdition(false);
      void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_MES_DUELS });
    },
  });

  const v1 = t("relectureNative.poster.duels.version1");
  const v2 = t("relectureNative.poster.duels.version2");
  const nomCote = (c: CoteDuel | CibleRemarque) =>
    c === "gauche" ? v1 : c === "droite" ? v2 : c === "egal" ? t("relectureNative.poster.duels.egal") : t("relectureNative.poster.duels.lesDeux");

  return (
    <Card data-testid="duel-relecteur">
      <CardPanel className="space-y-4">
        <TableDuel source={duel.slides_source} gauche={duel.deck_gauche} droite={duel.deck_droite} titreGauche={v1} titreDroite={v2} />

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
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("relectureNative.poster.duels.question")}</p>
              <div className="flex flex-wrap gap-2">
                {(["gauche", "egal", "droite"] as const).map((c) => (
                  <Button key={c} size="sm" variant={cote === c ? "default" : "outline"} aria-pressed={cote === c} onClick={() => setCote(c)}>
                    {c === "gauche"
                      ? t("relectureNative.poster.duels.voterGauche")
                      : c === "egal"
                        ? t("relectureNative.poster.duels.voterEgal")
                        : t("relectureNative.poster.duels.voterDroite")}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Etoiles libelle={t("relectureNative.poster.duels.noter", { version: v1 })} valeur={noteGauche} onChange={setNoteGauche} />
              <Etoiles libelle={t("relectureNative.poster.duels.noter", { version: v2 })} valeur={noteDroite} onChange={setNoteDroite} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`remarque-${duel.duel_id}`}>{t("relectureNative.poster.duels.remarque")}</Label>
              <Textarea
                id={`remarque-${duel.duel_id}`}
                rows={2}
                placeholder={t("relectureNative.poster.duels.remarqueAide")}
                value={remarque}
                onChange={(e) => setRemarque(e.target.value)}
              />
              {remarque.trim() && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`sur-${duel.duel_id}`}>{t("relectureNative.poster.duels.remarqueSur")}</Label>
                    <select id={`sur-${duel.duel_id}`} className={selectClass} value={remarqueSur} onChange={(e) => setRemarqueSur(e.target.value as CibleRemarque)}>
                      {(["gauche", "droite", "les_deux"] as const).map((c) => (
                        <option key={c} value={c}>
                          {nomCote(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`type-${duel.duel_id}`}>{t("relectureNative.poster.duels.typeErreur")}</Label>
                    <select id={`type-${duel.duel_id}`} className={selectClass} value={typeErreur} onChange={(e) => setTypeErreur(e.target.value as TypeErreur | "")}>
                      <option value="">{t("relectureNative.poster.duels.typeAucun")}</option>
                      {TYPES_ERREUR.map((k) => (
                        <option key={k} value={k}>
                          {t(`relectureNative.poster.duels.types.${k}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={!cote || voter.isPending} onClick={() => voter.mutate()}>
                {voter.isPending ? t("common.loading") : t("relectureNative.poster.duels.envoyer")}
              </Button>
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

/** Une note de 1 à 5, en étoiles ; recliquer la même étoile retire la note. */
function Etoiles({ libelle, valeur, onChange }: { libelle: string; valeur: number | null; onChange: (n: number | null) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{libelle}</p>
      <div role="radiogroup" aria-label={libelle} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valeur === n}
            aria-label={`${n}/5`}
            onClick={() => onChange(valeur === n ? null : n)}
            className="rounded p-0.5 text-muted-foreground hover:text-amber-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Star className={cn("size-5", valeur != null && n <= valeur && "fill-amber-400 text-amber-500")} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
