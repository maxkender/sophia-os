import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";

import {
  type ChoixSamedi,
  lireBrouillonsSamedi,
  lundiDuProchainSamedi,
  noterBrouillonSamedi,
} from "./semaineComptes";
import { semaineCommencee } from "./statutCompte";

/** Les décisions qu'on peut préparer (jamais de report le samedi). */
const CHOIX_PREPARABLES: readonly ChoixSamedi[] = ["keep", "kill", "kill_np", "double", "repondre", "recreate", "pause"];

const dateCourte = (jour: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${jour}T12:00:00Z`));

function LigneCompte({ compteId, handle, lundi, desactive }: { compteId: string; handle: string | null; lundi: string; desactive: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const brouillons = useQuery({ queryKey: ["samedi-brouillons", lundi], queryFn: () => lireBrouillonsSamedi(lundi) });
  const actuel = brouillons.data?.get(compteId);
  const [choix, setChoix] = React.useState<ChoixSamedi | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const choixVu = choix ?? actuel?.choix ?? "keep";
  const noteVue = note ?? actuel?.raison?.note ?? "";
  const enregistrer = useMutation({
    mutationFn: () => noterBrouillonSamedi(lundi, compteId, choixVu, { note: noteVue.trim() || null }),
    onSuccess: () => {
      setChoix(null);
      setNote(null);
      void qc.invalidateQueries({ queryKey: ["samedi-brouillons", lundi] });
    },
  });
  const change = choix !== null || note !== null;
  const p = "posters.decisionSamedi";
  return (
    <li className="space-y-1.5 rounded-md border p-2" data-decision-compte={handle ?? compteId}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{handle ? `@${handle}` : t(`${p}.sansHandle`)}</span>
        {actuel && actuel.choix !== "keep" && (
          <Badge variant={actuel.choix.startsWith("kill") ? "error" : "info"} data-testid="decision-notee">
            {t(`autoOnglets.decisions.liste.samedi.choix.${actuel.choix}`)}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label={t(`${p}.choix`)}
          value={choixVu}
          disabled={desactive}
          onChange={(e) => setChoix(e.target.value as ChoixSamedi)}
        >
          {CHOIX_PREPARABLES.map((o) => (
            <option key={o} value={o}>{t(`autoOnglets.decisions.liste.samedi.choix.${o}`)}</option>
          ))}
        </select>
        <Input
          className="h-8 min-w-48 flex-1"
          aria-label={t(`${p}.note`)}
          placeholder={t(`${p}.note`)}
          value={noteVue}
          disabled={desactive}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" disabled={desactive || !change} loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {t(`${p}.enregistrer`)}
        </Button>
      </div>
      {actuel?.maj_at && (
        <p className="text-[11px] text-muted-foreground">
          {t(`${p}.notePar`, {
            par: actuel.par_nom ?? "—",
            date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(actuel.maj_at)),
          })}
        </p>
      )}
      {choixVu === "kill_np" && <p className="text-[11px] text-muted-foreground">{t(`${p}.killNp`)}</p>}
      {(enregistrer.error || brouillons.error) && (
        <p className="text-xs text-destructive">{((enregistrer.error ?? brouillons.error) as Error).message}</p>
      )}
    </li>
  );
}

/**
 * 0492 : Posters → fiche d'un posteur : « Prepare a decision for Saturday ».
 * La décision est le brouillon du samedi de la semaine (samedi_brouillons) :
 * Weekly decisions → Saturday la pré-coche et met le compte dans « To handle ».
 * Rien n'est fait avant Validate, le samedi.
 */
export function DecisionPreparee({
  comptes,
  cohorteLundi,
  maintenant = new Date(),
}: {
  comptes: readonly { id: string; handle_tiktok: string | null }[];
  cohorteLundi: string | null | undefined;
  maintenant?: Date;
}) {
  const { t } = useTranslation();
  const lundi = lundiDuProchainSamedi(aujourdhuiParis(maintenant));
  const samedi = ajouterJours(lundi, 5);
  // La cohorte qui n'a pas encore commencé se décide le dimanche soir (Sunday: warm-up), pas le samedi.
  const aVenir = !semaineCommencee(cohorteLundi, lundi);
  const p = "posters.decisionSamedi";
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3" data-testid="decision-preparee">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t(`${p}.titre`, { date: dateCourte(samedi) })}
      </p>
      <p className="text-xs text-muted-foreground">{t(`${p}.aide`)}</p>
      {aVenir && <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="decision-a-venir">{t(`${p}.aVenir`, { date: dateCourte(cohorteLundi!) })}</p>}
      {comptes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t(`${p}.aucunCompte`)}</p>
      ) : (
        <ul className="space-y-2">
          {comptes.map((c) => (
            <LigneCompte key={c.id} compteId={c.id} handle={c.handle_tiktok} lundi={lundi} desactive={aVenir} />
          ))}
        </ul>
      )}
    </div>
  );
}
