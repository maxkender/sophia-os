// BLEO — petits morceaux partagés des pages de la section BLEO.

import type React from "react";
import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  CircleDashed,
  FlaskConical,
  Hourglass,
  Repeat,
  RotateCcw,
  Sparkles,
  Sprout,
  TrendingDown,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { EtatBleo, VerdictContenu, VerdictFamille } from "./api";
import { messageErreur } from "./format";

export const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";

/** Les tableaux de la section : en-têtes discrets, lignes fines, chiffres alignés. */
export const TH = "px-2 py-2 text-left font-medium";
export const TH_NUM = "px-2 py-2 text-right font-medium";
export const TD = "px-2 py-1.5 align-top";
export const TD_NUM = "px-2 py-1.5 text-right tabular-nums align-top";

export function Tableau({ children, minWidth = "40rem" }: { children: React.ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function EnteteTableau({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b text-muted-foreground">{children}</tr>
    </thead>
  );
}

export function Ligne({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b last:border-0", className)}>{children}</tr>;
}

/** Chargement, erreur ou rien : la même ligne partout dans la section. */
export function EtatRequete({ erreur, chargement }: { erreur?: unknown; chargement?: boolean }) {
  const { t } = useTranslation();
  if (erreur)
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(erreur)}
      </p>
    );
  if (chargement) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  return null;
}

/** Un titre de carte précédé de son icône, partout dans la section. */
export function TitreCarte({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2">
      <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {children}
    </CardTitle>
  );
}

/** Une étiquette de liste de définitions précédée de son icône. */
export function EtiquetteIcone({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return (
    <dt className="flex items-center gap-1.5 text-muted-foreground">
      <Icone className="size-3.5 shrink-0" aria-hidden />
      {children}
    </dt>
  );
}

const VERDICTS: Record<VerdictFamille | VerdictContenu, { variante: "success" | "secondary" | "warning"; icone: LucideIcon }> = {
  gagnante: { variante: "success", icone: Trophy },
  gagnant: { variante: "success", icone: Trophy },
  en_attente: { variante: "secondary", icone: Hourglass },
  non_gagnante: { variante: "warning", icone: TrendingDown },
  non_gagnant: { variante: "warning", icone: TrendingDown },
};

export function BadgeVerdict({ verdict }: { verdict: VerdictFamille | VerdictContenu | null }) {
  const { t } = useTranslation();
  if (!verdict) return <span className="text-muted-foreground">—</span>;
  const { variante, icone: Icone } = VERDICTS[verdict];
  return (
    <Badge variant={variante}>
      <Icone aria-hidden />
      {t(`bleo.verdicts.${verdict}`)}
    </Badge>
  );
}

const ETATS: Record<EtatBleo, LucideIcon> = { a_juger: CircleDashed, en_test: FlaskConical, juge: CircleCheck };

export function BadgeEtat({ etat }: { etat: EtatBleo | null }) {
  const { t } = useTranslation();
  if (!etat) return <span className="text-muted-foreground">—</span>;
  const Icone = ETATS[etat];
  return (
    <Badge variant={etat === "juge" ? "outline" : "info"}>
      <Icone aria-hidden />
      {t(`bleo.etats.${etat}`)}
    </Badge>
  );
}

const CATEGORIES: Record<string, { variante: "info" | "success" | "warning" | "secondary"; icone: LucideIcon }> = {
  juger: { variante: "info", icone: FlaskConical },
  recolte: { variante: "success", icone: Sprout },
  gagnant_servi: { variante: "success", icone: Trophy },
  non_gagnant_neuve: { variante: "warning", icone: Sparkles },
  non_gagnant_servie: { variante: "warning", icone: Repeat },
  rappel: { variante: "secondary", icone: RotateCcw },
};

/** La catégorie d'un passage du plan ; l'infobulle dit ce qu'elle veut dire. */
export function BadgeCategorie({ categorie }: { categorie: string | null }) {
  const { t } = useTranslation();
  if (!categorie) return <span className="text-muted-foreground">—</span>;
  const c = CATEGORIES[categorie];
  const Icone = c?.icone;
  return (
    <Badge variant={c?.variante ?? "outline"} title={t(`bleo.categoriesAide.${categorie}`, { defaultValue: "" }) || undefined}>
      {Icone && <Icone aria-hidden />}
      {t(`bleo.categories.${categorie}`, { defaultValue: categorie })}
    </Badge>
  );
}

/** « G0 », « G1 », « G2 » : la génération d'un contenu dans sa famille. */
export function Generation({ g }: { g: number | null }) {
  const { t } = useTranslation();
  return (
    <span className="font-mono text-[11px]" title={t(`bleo.generations.g${g ?? 0}`, { defaultValue: "" })}>
      G{g ?? 0}
    </span>
  );
}
