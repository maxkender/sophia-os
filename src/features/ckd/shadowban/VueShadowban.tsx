import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, RefreshCw, Repeat, TimerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarreChargement } from "@/components/ui/progress";
import {
  ignorerShadowban,
  listerPersonnes,
  listerShadowban,
  rafraichirShadowban,
  recreerShadowban,
  type PersonneCkd,
  type ShadowbanCkd,
} from "@/features/ckd/api";
import { DiagnosticCompte } from "@/features/ckd/DiagnosticCompte";
import { lienTiktok } from "@/features/ckd/logique";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import { localeDate } from "@/locales/localeDate";

const CLE = ["ckd", "shadowban"] as const;

function nomPersonne(p: PersonneCkd | undefined): string {
  return [p?.prenom, p?.nom].filter(Boolean).join(" ") || "—";
}

function LigneShadowban({ s, personnes }: { s: ShadowbanCkd; personnes: Map<string, PersonneCkd> }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const recreer = useMutation({
    mutationFn: () => recreerShadowban(s.compte_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
  const ignorer = useMutation({
    mutationFn: () => ignorerShadowban(s.compte_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
  const tiktok = lienTiktok(s.handle);
  const langue = localeDate(i18n.resolvedLanguage);
  const derniers = s.donnees.derniers ?? [];
  const enCours = Boolean(s.recreation_at) && !s.nouveau_compte_id && !s.erreur;

  return (
    <div className="space-y-2 py-4 first:pt-0 last:pb-0" data-testid={`shadowban-${s.handle}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {tiktok ? (
          <a href={tiktok} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
            {drapeauPays(s.pays)} @{s.handle} <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="font-medium">—</span>
        )}
        <span className="text-muted-foreground">{nomPersonne(personnes.get(s.poster_id))}</span>
        <span className="text-muted-foreground">
          {t("ckd.shadowban.hm")} : {s.hm_id ? nomPersonne(personnes.get(s.hm_id)) : "—"}
        </span>
        {s.pays && <span className="text-muted-foreground">{nomPaysIso(s.pays)}</span>}
        <span className="text-muted-foreground">
          {t("ckd.shadowban.depuis", { date: new Date(`${s.depuis}T12:00:00Z`).toLocaleDateString(langue, { day: "numeric", month: "short" }) })}
        </span>
      </div>

      <DiagnosticCompte diagnostic={s.diagnostic} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {t("ckd.shadowban.derniers")} :{" "}
          <span className="font-mono text-foreground">
            {derniers.length > 0 ? derniers.map((d) => (d.vues ?? "—").toLocaleString()).join(" · ") : "—"}
          </span>
        </span>
        <span>
          {t("ckd.shadowban.medianePays")} :{" "}
          <span className="font-mono text-foreground">{s.diagnostic?.mediane_ref?.toLocaleString() ?? "—"}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {s.nouveau_compte_id ? (
          <span className="text-sm text-success-foreground">{t("ckd.shadowban.nouveauCree")}</span>
        ) : (
          <Button size="sm" disabled={enCours || recreer.isPending} onClick={() => recreer.mutate()}>
            <Repeat />
            {enCours || recreer.isPending ? t("ckd.shadowban.creationEnCours") : t("ckd.shadowban.nouveauCompte")}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={ignorer.isPending} onClick={() => ignorer.mutate()}>
          <TimerOff />
          {t("ckd.shadowban.ignorer")}
        </Button>
        {(recreer.error || ignorer.error || s.erreur) && (
          <span className="text-xs text-destructive">
            {String((recreer.error as Error | null)?.message ?? (ignorer.error as Error | null)?.message ?? s.erreur)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Check, Kill or Double → Shadowban (0362) : recalculée chaque matin à 6 h.
 * « Shadowban probable » : publie, mais ses 4 derniers posts mesurés (≥ 48 h)
 * sont sous le seuil des posts morts. « Vues anormalement basses » : médiane
 * des 7 derniers jours sous 20 % de la médiane du pays.
 */
export function VueShadowban() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const liste = useQuery({
    queryKey: CLE,
    queryFn: async () => {
      const lignes = await listerShadowban();
      const ids = [...new Set(lignes.flatMap((l) => [l.poster_id, l.hm_id]).filter((x): x is string => Boolean(x)))];
      const personnes = new Map((await listerPersonnes(ids)).map((p) => [p.id, p]));
      return { lignes, personnes };
    },
  });
  const rafraichir = useMutation({
    mutationFn: rafraichirShadowban,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });

  const lignes = liste.data?.lignes ?? [];
  const groupes = [
    { type: "shadowban" as const, lignes: lignes.filter((l) => l.type === "shadowban") },
    { type: "vues_basses" as const, lignes: lignes.filter((l) => l.type === "vues_basses") },
  ];
  const calcule = lignes[0]?.calcule_at;

  return (
    <div className="space-y-6" data-testid="vue-shadowban">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("ckd.shadowban.intro")}
          {calcule && ` ${t("ckd.shadowban.calcule", { quand: new Date(calcule).toLocaleString(localeDate()) })}`}
        </p>
        <Button size="sm" variant="outline" disabled={rafraichir.isPending} onClick={() => rafraichir.mutate()}>
          <RefreshCw />
          {t("ckd.shadowban.recalculer")}
        </Button>
      </div>
      <BarreChargement actif={liste.isLoading || rafraichir.isPending} />
      {(liste.error || rafraichir.error) && (
        <p className="text-sm text-destructive">{String(((liste.error ?? rafraichir.error) as Error).message)}</p>
      )}

      {groupes.map((g) => (
        <Card key={g.type}>
          <CardHeader>
            <CardTitle>
              {t(`ckd.shadowban.types.${g.type}`)} · {g.lignes.length}
            </CardTitle>
            <CardDescription>{t(`ckd.shadowban.typesDesc.${g.type}`)}</CardDescription>
          </CardHeader>
          <CardContent>
            {g.lignes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ckd.shadowban.vide")}</p>
            ) : (
              <div className="divide-y">
                {g.lignes.map((s) => (
                  <LigneShadowban key={s.compte_id} s={s} personnes={liste.data!.personnes} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
