import * as React from "react";

import { Popover } from "@base-ui/react/popover";
import { Boxes, Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import { couleurApplication, nomAffiche } from "@/components/brand/identiteApplications";
import { LogoApplication } from "@/components/brand/LogoApplication";
import type { Segment } from "./segments";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Les graphes de la page Répartition, dessinés à la main (pas de
 * bibliothèque de graphes dans l'OS) et tenus aux mêmes règles partout :
 *   * une couleur PAR APPLICATION, jamais par rang (`couleurApplication`) ;
 *   * des barres fines, 2 px de vide entre deux segments, bout arrondi de
 *     4 px côté valeur et carré côté base ;
 *   * le texte ne prend jamais la couleur de la donnée : l'identité passe par
 *     le logo et la pastille de couleur à côté ;
 *   * chaque segment a son infobulle au survol ; au clavier et au lecteur
 *     d'écran, la barre entière dit toutes ses valeurs (`aria-label`), et
 *     chaque chiffre reste lisible ailleurs sans survoler (légende, tableau).
 *     Pas d'arrêt de tabulation par segment : une barre est une image.
 */

function pourcent(n: number): string {
  return `${Math.round(n)} %`;
}

const HAUTEURS = { xs: "h-1.5", sm: "h-2.5", md: "h-4", lg: "h-7" } as const;

/** Une barre 100 % empilée : la part de chacun dans un tout. */
export function BarreRepartition({
  segments,
  hauteur = "md",
  etiquettes = false,
  vide = "—",
  className,
  "aria-label": ariaLabel,
}: {
  segments: Segment[];
  hauteur?: keyof typeof HAUTEURS;
  /** Écrit le pourcentage DANS le segment quand il y tient (barres hautes seulement). */
  etiquettes?: boolean;
  vide?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.valeur), 0);
  const visibles = segments.filter((s) => s.valeur > 0);
  if (total <= 0 || visibles.length === 0) {
    return <span className="text-xs text-muted-foreground">{vide}</span>;
  }
  const resume = visibles
    .map((s) => `${s.libelle} ${s.valeurAffichee ?? pourcent((100 * s.valeur) / total)}`)
    .join(", ");
  return (
    <div
      role="img"
      aria-label={ariaLabel ? `${ariaLabel} : ${resume}` : resume}
      className={cn("flex w-full min-w-0 gap-[2px]", HAUTEURS[hauteur], className)}
    >
      {visibles.map((s, i) => {
        const part = (100 * s.valeur) / total;
        const dernier = i === visibles.length - 1;
        // Un pourcentage n'est écrit dans le segment que s'il y tient avec de
        // l'air : sinon il vit dans l'infobulle, jamais rogné.
        const ecrit = etiquettes && hauteur === "lg" && part >= 11;
        return (
          <Tooltip key={s.cle}>
            <TooltipTrigger
              delay={80}
              render={<div />}
              className={cn(
                "flex h-full min-w-[3px] items-center justify-center transition-[filter] hover:brightness-110",
                dernier && "rounded-r-[4px]",
              )}
              style={{ flexGrow: s.valeur, flexBasis: 0, background: s.couleur }}
            >
              {ecrit && (
                <span className="px-1 text-xs font-semibold text-white tabular-nums">{pourcent(part)}</span>
              )}
            </TooltipTrigger>
            <TooltipPopup side="top" className="flex-col items-start gap-0.5 px-2.5 py-1.5">
              <span className="text-sm font-semibold tabular-nums">{s.valeurAffichee ?? pourcent(part)}</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.couleur }} aria-hidden />
                {s.libelle}
              </span>
              {s.detail && <span className="text-muted-foreground">{s.detail}</span>}
            </TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** La légende d'un graphe par application : logo, nom, et la valeur si on la donne. */
export function LegendeApplications({
  elements,
  className,
}: {
  elements: Array<{ slug: string; valeur?: React.ReactNode }>;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs", className)}>
      {elements.map((e) => (
        <li key={e.slug} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[3px]" style={{ background: couleurApplication(e.slug) }} aria-hidden />
          <LogoApplication slug={e.slug} taille="xs" decoratif />
          <span className="text-foreground">{nomAffiche(e.slug)}</span>
          {e.valeur !== undefined && <span className="tabular-nums text-muted-foreground">{e.valeur}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * La réserve d'un label en jours, sur une échelle fixe : la barre s'arrête à
 * `max` (au-delà, le label est confortable et la longueur exacte n'apprend
 * plus rien) et deux repères disent où le moteur change de comportement.
 */
export function BarreReserve({
  jours,
  seuil,
  max = 30,
  libelleSeuil,
}: {
  jours: number;
  seuil: number;
  max?: number;
  libelleSeuil: string;
}) {
  const borne = Math.max(0, Math.min(jours, max));
  const bas = jours < seuil;
  return (
    <div className="relative h-2.5 w-full min-w-24 rounded-[3px] bg-muted" aria-hidden>
      <div
        className={cn("h-full rounded-r-[4px]", bas ? "bg-destructive" : "bg-foreground/70")}
        style={{ width: `${(100 * borne) / max}%` }}
      />
      <div
        className="absolute -top-1 h-[calc(100%+0.5rem)] w-px bg-foreground/40"
        style={{ left: `${(100 * seuil) / max}%` }}
        title={libelleSeuil}
      />
    </div>
  );
}

/**
 * Une bulle qui s'ouvre au CLIC (et au toucher, et au clavier) : le détail est
 * là pour qui le cherche, pas en pavé. Pas une infobulle de survol, qu'un
 * téléphone n'ouvre jamais.
 */
export function Bulle({
  declencheur,
  libelle,
  children,
  className,
}: {
  declencheur: React.ReactNode;
  libelle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={libelle}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
      >
        {declencheur}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={6} className="z-50">
          <Popover.Popup className="w-72 max-w-[min(18rem,var(--available-width))] rounded-md border bg-popover p-2.5 text-left text-xs font-normal leading-snug text-popover-foreground shadow-md outline-none">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** L'aide d'un titre : une icône « i » qui ouvre son explication. */
export function Aide({ children, libelle }: { children: React.ReactNode; libelle: string }) {
  const { t } = useTranslation();
  return (
    <Bulle
      libelle={t("repartition.aideDe", { titre: libelle })}
      className="size-4 justify-center rounded-full text-muted-foreground hover:text-foreground"
      declencheur={<Info className="size-3.5" aria-hidden />}
    >
      {children}
    </Bulle>
  );
}

/**
 * Marque d'un label 100 % podz (0352) : tout son contenu est livré par un pod.
 * Même icône que l'entrée « Podz » du menu. Le moteur ne le juge pas sur sa
 * réserve, il le remplit langue par langue.
 */
export function IconePod({ className }: { className?: string }) {
  const { t } = useTranslation();
  const libelle = t("repartition.labelPod");
  return (
    <span
      title={libelle}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px font-sans text-[10px] font-medium text-foreground/80",
        className,
      )}
    >
      <Boxes className="size-3" aria-hidden />
      Podz
      <span className="sr-only">{libelle}</span>
    </span>
  );
}

/** Le nom d'un label, suivi de la marque pod s'il est 100 % podz. */
export function NomLabel({ nom, pod, className }: { nom: string; pod?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className="truncate font-mono">{nom}</span>
      {pod && <IconePod />}
    </span>
  );
}
