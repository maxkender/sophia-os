import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { GROUPES_PRET, lirePretLundi, manquants, type PointPret } from "./api";

function Ligne({ p }: { p: PointPret }) {
  const { t } = useTranslation();
  const Icone = p.ok === true ? CheckCircle2 : p.ok === false ? XCircle : Info;
  return (
    <li className="flex flex-wrap items-center gap-2 py-1" data-pret={p.cle} data-ok={String(p.ok)}>
      <Icone
        className={cn("size-4 shrink-0", p.ok === true ? "text-success" : p.ok === false ? "text-destructive" : "text-muted-foreground")}
        aria-label={t(p.ok === true ? "pretLundi.ok" : p.ok === false ? "pretLundi.manque" : "pretLundi.info")}
      />
      <span className="min-w-48">{t(`pretLundi.points.${p.cle}`)}</span>
      <span className={cn("tabular-nums font-medium", p.ok === false && "text-destructive")}>{p.valeur}</span>
      {p.attendu !== null && p.ok === false && (
        <span className="text-xs text-muted-foreground">{t("pretLundi.attendu", { attendu: p.attendu })}</span>
      )}
      <Link to={p.lien} className="ml-auto text-xs text-primary underline">{t("pretLundi.ouvrir")}</Link>
    </li>
  );
}

/**
 * Lundi 2/11 : « Ready for Monday ». Un seul bloc en haut de l'Overview : les
 * interrupteurs (et ce qu'ils doivent être), Contracts to link et doublons,
 * la cohorte du lundi, le samedi, la paie du lundi, Needs you. Vert : bon ;
 * rouge : manque, avec le lien vers la page qui corrige. Lecture seule.
 */
export function PretLundi() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["pret-lundi"], queryFn: lirePretLundi, refetchInterval: 60_000 });
  const points = lu.data ?? [];
  const n = manquants(points);
  return (
    <Card data-testid="pret-lundi" className={n > 0 ? "border-destructive/50" : points.length ? "border-success/50" : undefined}>
      <CardHeader>
        <CardTitle className="text-base">{n > 0 ? t("pretLundi.titreManque", { n }) : t("pretLundi.titrePret")}</CardTitle>
        <CardDescription>{t("pretLundi.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm md:grid-cols-2">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {GROUPES_PRET.map((g) => {
          const du = points.filter((p) => p.groupe === g);
          if (!du.length) return null;
          return (
            <section key={g} data-groupe={g}>
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t(`pretLundi.groupes.${g}`)}</h3>
              <ul className="divide-y divide-border/50">{du.map((p) => <Ligne key={p.cle} p={p} />)}</ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
