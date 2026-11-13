import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, FileCheck, Languages, ListChecks, Scissors, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { messageErreur } from "@/features/bleo/format";
import { cn } from "@/lib/utils";

import { type BoucleLangue, CLE_BOUCLE, etatBoucle } from "./apiBoucle";

export type EtapeBoucle = "relectures" | "relecteurs" | "corrections" | "traduction";


/**
 * La boucle de correction en quatre étapes, avec les chiffres des 7 derniers
 * jours par langue : posts envoyés le samedi → relus par le natif →
 * corrections à trier → retenues, dans la traduction. Même bandeau en tête
 * de Relecture native (clic sur une étape = onglet) et de Traduction &
 * placement → Langues (clic = lien vers Relecture native).
 */
export function BandeauBoucle({
  onEtape,
  langue,
  compact = false,
}: {
  /** Relecture native : ouvre l'onglet de l'étape. Sans valeur : liens vers la page. */
  onEtape?: (etape: EtapeBoucle) => void;
  /** Une seule langue (Traduction & placement), sinon toutes. */
  langue?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const etat = useQuery({ queryKey: CLE_BOUCLE, queryFn: etatBoucle });
  const lignes = (etat.data ?? []).filter((l) => !langue || l.langue === langue.toLowerCase());

  const Etape = ({ cle, icone: Icone, enfant }: { cle: EtapeBoucle; icone: LucideIcon; enfant: React.ReactNode }) => {
    const contenu = (
      <>
        <Icone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-medium">{t(`relectureNative.boucle.etapes.${cle}`)}</span>
        {enfant}
      </>
    );
    const classes = "flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs hover:bg-muted";
    if (onEtape) {
      return (
        <button type="button" className={classes} onClick={() => onEtape(cle)} data-testid={`boucle-${cle}`}>
          {contenu}
        </button>
      );
    }
    const vers = cle === "traduction" ? "/admin/chaine" : "/admin/relecture-native";
    return (
      <Link to={vers} className={classes} data-testid={`boucle-${cle}`}>
        {contenu}
      </Link>
    );
  };

  return (
    <div className={cn("space-y-2 rounded-lg border bg-muted/20 p-3", compact && "p-2")} data-testid="bandeau-boucle">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold">{t("relectureNative.boucle.titre")}</p>
        <p className="text-xs text-muted-foreground">{t("relectureNative.boucle.aide")}</p>
      </div>
      {etat.error && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(etat.error)}
        </p>
      )}
      {etat.isSuccess && lignes.length === 0 && <p className="text-xs text-muted-foreground">{t("relectureNative.boucle.aucune")}</p>}
      {lignes.map((l) => (
        <div key={l.langue} className="flex flex-wrap items-center gap-1.5" data-testid="boucle-langue" data-langue={l.langue}>
          {!langue && (
            <span className="w-24 shrink-0 text-xs">
              <span aria-hidden>{drapeauLangue(l.langue)}</span> {nomLangue(l.langue)}
            </span>
          )}
          <Etape
            cle="relectures"
            icone={FileCheck}
            enfant={<Badge variant={l.a_relire > 0 ? "info" : "outline"}>{t("relectureNative.boucle.envoyes", { n: l.envoyes_7j, aFaire: l.a_relire })}</Badge>}
          />
          <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
          <Etape
            cle="relecteurs"
            icone={ListChecks}
            enfant={
              <>
                <Badge variant="outline">{t("relectureNative.boucle.relus", { n: l.relus_7j })}</Badge>
                {l.duels_a_voter > 0 && <Badge variant="outline">{t("relectureNative.boucle.duels", { n: l.duels_a_voter })}</Badge>}
              </>
            }
          />
          <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
          <Etape
            cle="corrections"
            icone={Scissors}
            enfant={<Badge variant={l.proposees > 0 ? "warning" : "outline"}>{t("relectureNative.boucle.proposees", { n: l.proposees })}</Badge>}
          />
          <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
          <Etape
            cle="traduction"
            icone={Languages}
            enfant={<Badge variant={l.retenues > 0 ? "success" : "outline"}>{t("relectureNative.boucle.retenues", { n: l.retenues, semaine: l.retenues_7j })}</Badge>}
          />
          <Reprises l={l} />
        </div>
      ))}
    </div>
  );
}

function Reprises({ l }: { l: BoucleLangue }) {
  const { t } = useTranslation();
  if (l.reprises_pct == null) return null;
  const avant = l.reprises_pct_avant;
  const mieux = avant != null && l.reprises_pct < avant;
  const pire = avant != null && l.reprises_pct > avant;
  return (
    <Badge variant={mieux ? "success" : pire ? "warning" : "outline"} data-testid="boucle-reprises">
      {avant == null
        ? t("relectureNative.boucle.reprises", { pct: l.reprises_pct })
        : t("relectureNative.boucle.reprisesTendance", { pct: l.reprises_pct, avant })}
    </Badge>
  );
}
