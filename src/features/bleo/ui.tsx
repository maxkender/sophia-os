// BLEO — petits morceaux partagés des pages de la section BLEO.

import type React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
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

const VARIANTE_VERDICT = {
  gagnante: "success",
  gagnant: "success",
  en_attente: "secondary",
  non_gagnante: "warning",
  non_gagnant: "warning",
} as const;

export function BadgeVerdict({ verdict }: { verdict: VerdictFamille | VerdictContenu | null }) {
  const { t } = useTranslation();
  if (!verdict) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={VARIANTE_VERDICT[verdict]}>{t(`bleo.verdicts.${verdict}`)}</Badge>;
}

export function BadgeEtat({ etat }: { etat: EtatBleo | null }) {
  const { t } = useTranslation();
  if (!etat) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={etat === "juge" ? "outline" : "info"}>{t(`bleo.etats.${etat}`)}</Badge>;
}

const VARIANTE_CATEGORIE: Record<string, "info" | "success" | "warning" | "secondary" | "outline"> = {
  juger: "info",
  recolte: "success",
  gagnant_servi: "success",
  non_gagnant_neuve: "warning",
  non_gagnant_servie: "warning",
  rappel: "secondary",
};

export function BadgeCategorie({ categorie }: { categorie: string | null }) {
  const { t } = useTranslation();
  if (!categorie) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={VARIANTE_CATEGORIE[categorie] ?? "outline"}>
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
