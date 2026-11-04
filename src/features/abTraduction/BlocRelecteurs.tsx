import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formaterNombre, formaterPart } from "@/features/bleo/format";
import { localeDate } from "@/locales/localeDate";

import { type RapportVotes, verdictCandidat } from "./api";

const dateCourte = (iso: string, langue: string) =>
  new Date(iso).toLocaleDateString(localeDate(langue), { day: "numeric", month: "short" });

/**
 * Les relecteurs natifs d'une langue × candidat × version (0626) : envoi
 * groupé des duels non envoyés, décompte de leurs votes, verdict D8, notes
 * moyennes, erreurs relevées et dernières remarques. Affiché dans Relecture
 * native (onglet Duels).
 */
export function BlocRelecteurs({
  rapport,
  nonEnvoyes,
  envoyer,
  enCours,
}: {
  rapport: RapportVotes | null;
  nonEnvoyes: number;
  envoyer: () => void;
  enCours: boolean;
}) {
  const { t, i18n } = useTranslation();
  const verdict = rapport ? verdictCandidat(rapport) : null;
  const tonVerdict = verdict === "retenu" ? "success" : verdict === "ecarte" ? "warning" : "outline";

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm" data-testid="ab-relecteurs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          {t("abTraduction.duels.relecteurs.titre")}
        </p>
        <Button size="sm" variant="outline" disabled={nonEnvoyes === 0 || enCours} onClick={envoyer}>
          {t("abTraduction.duels.relecteurs.envoyerTous", { n: nonEnvoyes })}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("abTraduction.duels.relecteurs.aide")}</p>
      {rapport ? (
        <div className="space-y-1">
          <p>
            {t("abTraduction.duels.relecteurs.envoyes", { duels: rapport.duels_envoyes, votes: rapport.votes, relecteurs: rapport.relecteurs })}
            {rapport.votes > 0 && (
              <>
                {" · "}
                {t("abTraduction.duels.decompte", {
                  votes: rapport.votes,
                  candidat: rapport.candidat_gagne,
                  actuel: rapport.actuel_gagne,
                  egal: rapport.egal,
                })}
              </>
            )}
          </p>
          {rapport.votes > 0 && (
            <p className="flex flex-wrap items-center gap-2">
              {rapport.part_candidat != null && <span>{t("abTraduction.duels.relecteurs.part", { part: formaterPart(rapport.part_candidat) })}</span>}
              {verdict && <Badge variant={tonVerdict}>{t(`abTraduction.duels.relecteurs.verdict_${verdict}`)}</Badge>}
              {(rapport.note_actuel != null || rapport.note_candidat != null) && (
                <span className="text-muted-foreground">
                  {t("abTraduction.duels.relecteurs.notes", {
                    actuel: formaterNombre(rapport.note_actuel, 1),
                    candidat: formaterNombre(rapport.note_candidat, 1),
                  })}
                </span>
              )}
            </p>
          )}
          {Object.keys(rapport.types_erreur).length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("abTraduction.duels.relecteurs.types")}
              {": "}
              {Object.entries(rapport.types_erreur)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => `${t(`relectureNative.poster.duels.types.${k}`)} ${n}`)
                .join(" · ")}
            </p>
          )}
          {rapport.remarques.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-medium">
                {t("abTraduction.duels.relecteurs.remarques", { n: rapport.remarques.length })}
              </summary>
              <ul className="mt-1 space-y-1 text-xs">
                {rapport.remarques.map((r, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">
                      {dateCourte(r.le, i18n.language)}
                      {r.sur && ` · ${t(`abTraduction.duels.relecteurs.sur_${r.sur}`)}`}
                      {r.type && ` · ${t(`relectureNative.poster.duels.types.${r.type}`)}`}
                      {" : "}
                    </span>
                    {r.remarque}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("abTraduction.duels.relecteurs.rien")}</p>
      )}
    </div>
  );
}
