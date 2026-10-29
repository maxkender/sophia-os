import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lireReglagesBleo } from "@/features/bleo/api";
import { EtatRequete } from "@/features/bleo/ui";

/** Une valeur de réglage en une ligne : nombre, texte, liste ou petit objet. */
function texteValeur(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x !== "object" || x == null)) return v.join(" · ");
  return JSON.stringify(v);
}

/** Les clés d'une section, aplaties d'un niveau (« seuils.vues »). */
function lignes(section: unknown, prefixe = ""): Array<[string, string]> {
  if (section == null || typeof section !== "object" || Array.isArray(section)) return [[prefixe || "valeur", texteValeur(section)]];
  return Object.entries(section as Record<string, unknown>).flatMap(([k, v]) => {
    const cle = prefixe ? `${prefixe}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !prefixe) return lignes(v, cle);
    return [[cle, texteValeur(v)] as [string, string]];
  });
}

/**
 * BLEO, réglages : `reglages.bleo` tel que la nuit et le tirage le lisent,
 * section par section. Lecture seule : un changement passe par une migration,
 * pour garder la trace de qui a décidé quoi.
 */
export function AdminBleoReglagesPage() {
  const { t } = useTranslation();
  const reglages = useQuery({ queryKey: ["bleo", "reglages"], queryFn: lireReglagesBleo });
  const entrees = Object.entries(reglages.data ?? {});
  const simples = entrees.filter(([, v]) => v == null || typeof v !== "object" || Array.isArray(v));
  const sections = entrees.filter(([, v]) => v != null && typeof v === "object" && !Array.isArray(v));

  return (
    <div className="space-y-6" data-testid="page-bleo-reglages">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-6 text-muted-foreground" aria-hidden />
            {t("bleo.reglages.titre")}
          </span>
        }
        description={t("bleo.reglages.description")}
      />

      <EtatRequete erreur={reglages.error} chargement={reglages.isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        {simples.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("bleo.reglages.general")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
                {simples.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                    <dd className="text-right tabular-nums">{texteValeur(v)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}
        {sections.map(([nom, section]) => (
          <Card key={nom}>
            <CardHeader>
              <CardTitle>{t(`bleo.reglages.sections.${nom}`, { defaultValue: nom })}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
                {lignes(section).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                    <dd className="max-w-[16rem] break-words text-right tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
