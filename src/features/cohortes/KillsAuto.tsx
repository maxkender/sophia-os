import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Skull } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ModeInterrupteur } from "@/features/interrupteurs/api";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { annulerKill, lireKillsAuto, type KillAuto } from "./api";

const VARIANTE: Record<KillAuto["statut"], "info" | "warning" | "secondary" | "error"> = {
  simule: "info",
  en_attente: "warning",
  annule: "secondary",
  parti: "error",
  erreur: "error",
};

/**
 * Système du 2 nov., partie B : les Kills automatiques (48 h après le message
 * d'une étape, ni étape faite ni réponse). En attente : « Annuler » jusqu'à
 * la fin du délai ; ensuite l'arrêt complet part. En test : « simulé ».
 * Décisions finales : il n'y en a plus de nouveaux ; seul le samedi arrête.
 */
export function KillsAuto({ maintenant = new Date() }: { maintenant?: Date }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const kills = useQuery({ queryKey: ["kills-auto"], queryFn: lireKillsAuto });
  const annuler = useMutation({
    mutationFn: (id: string) => annulerKill(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kills-auto"] }),
  });
  // Décisions finales : plus de Kill automatique (l'interrupteur kill_auto est retiré) ; l'historique reste lisible.
  const mode: ModeInterrupteur = "off" as ModeInterrupteur;
  const liste = kills.data ?? [];
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  const enAttente = liste.filter((k) => k.statut === "en_attente").length;
  return (
    <section className="space-y-3 rounded-xl border p-4" data-testid="kills-auto">
      <div className="flex flex-wrap items-center gap-2">
        <Skull className="size-4" aria-hidden />
        <h2 className="font-semibold">{t("cohortes.kills.titre", { n: enAttente })}</h2>
        <Badge variant={mode === "on" ? "success" : mode === "test" ? "warning" : "secondary"}>{t(`interrupteurs.modes.${mode}`)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t(`cohortes.kills.aide.${mode}`)}</p>
      {kills.error && <p className="text-sm text-destructive">{(kills.error as Error).message}</p>}
      {annuler.error && <p className="text-sm text-destructive">{(annuler.error as Error).message}</p>}
      {liste.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("cohortes.kills.vide")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {liste.map((k) => {
            const annulable = (k.statut === "en_attente" && Date.parse(k.prevu_at) > maintenant.getTime()) || k.statut === "simule";
            const rouge = k.statut === "erreur" || k.arret_statut === "erreur";
            return (
              <li key={k.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-sm", rouge && "bg-destructive/5")} data-kill={k.id}>
                <span className="font-medium">{k.poster_nom ?? "—"}</span>
                {k.hm_prenom && <span className="text-xs text-muted-foreground">{t("cohortes.kills.hm", { hm: k.hm_prenom })}</span>}
                <span className="text-xs text-muted-foreground">{t(`nudges.types.${k.etape}`)}</span>
                <Badge variant={VARIANTE[k.statut]}>{t(`cohortes.kills.statuts.${k.statut}`)}</Badge>
                {k.statut === "en_attente" && (
                  <span className="text-xs">{t("cohortes.kills.partLe", { date: fmt.format(new Date(k.prevu_at)) })}</span>
                )}
                {k.statut === "annule" && k.raison && <span className="text-xs text-muted-foreground">{k.raison}</span>}
                {k.arret_statut && (
                  <span className={cn("text-xs", k.arret_statut === "erreur" ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {t(`cohortes.kills.arret.${k.arret_statut}`, { defaultValue: k.arret_statut })}
                    {k.arret_erreur ? ` : ${k.arret_erreur}` : ""}
                  </span>
                )}
                {k.statut === "erreur" && k.raison && <span className="text-xs font-medium text-destructive">{k.raison}</span>}
                {annulable && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7"
                    disabled={annuler.isPending}
                    onClick={() => {
                      if (window.confirm(t("cohortes.kills.annulerConfirm", { nom: k.poster_nom ?? "—" }))) annuler.mutate(k.id);
                    }}
                  >
                    {t("cohortes.kills.annuler")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
