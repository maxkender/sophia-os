import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { envoyerFile } from "@/features/auto/sent/attenteApi";
import { useAuth } from "@/features/auth/AuthContext";
import { deciderCkd, recreerShadowban } from "@/features/ckd/api";
import { aujourdhuiParis } from "@/features/moteur/cohortes";

import { lundiDeLaSemaine } from "./logique";
import {
  attendusJusquIci,
  type ChoixJeudi,
  choixJeudiInitial,
  type CompteSemaine,
  FILTRES_VIDES,
  filtrerComptes,
  lireSemaineComptes,
  type Tri,
  trierComptes,
  validerNudgesJeudi,
} from "./semaineComptes";
import { BarreFiltres, CelluleCompte, CellulesJours, CelluleVues, Choix, EnTetesJours, Signaux, TD, TH } from "./TableauComptes";

const CHOIX: readonly ChoixJeudi[] = ["nudge", "recreate", "rien"];

/**
 * Prompt 25, partie 3 : Weekly decisions → Thursday. Tous les comptes actifs,
 * une ligne par compte : posts avec lien jour par jour depuis lundi
 * (aujourd'hui compris) et le total, vues des derniers posts, signaux. Pour
 * chaque compte : Nudge, Recreate ou rien, pré-coché (Nudge : a manqué au
 * moins un post avec lien depuis lundi ; Recreate : shadowban supposé ou
 * compte mort). Rien ne part avant « Send » : les Nudge partent sur Slack
 * d'abord (Upwork dans le budget du jour), un par posteur ; les Recreate
 * suivent le parcours existant (contrôle du jeudi, ou page Shadowban).
 */
export function ListeJeudi({ maintenant = new Date() }: { maintenant?: Date }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  // Prompt 25 MAJ : le nudge du jeudi se choisit par Lucia (Head of Ops) ou Max.
  const admin = role === "admin" || role === "head_of_ops";
  const qc = useQueryClient();
  const aujourdhui = aujourdhuiParis(maintenant);
  const lundi = lundiDeLaSemaine(aujourdhui);
  const lu = useQuery({ queryKey: ["semaine-comptes", lundi, aujourdhui], queryFn: () => lireSemaineComptes(lundi, aujourdhui) });
  const [choix, setChoix] = React.useState<Record<string, ChoixJeudi>>({});
  const [filtres, setFiltres] = React.useState(FILTRES_VIDES);
  const [tri, setTri] = React.useState<Tri>("posts_asc");
  const [bilan, setBilan] = React.useState<string | null>(null);

  const liste = lu.data ?? [];
  const choixDe = (c: CompteSemaine) => choix[c.compte_id] ?? choixJeudiInitial(c);
  const nudges = liste.filter((c) => choixDe(c) === "nudge");
  const recreates = liste.filter((c) => choixDe(c) === "recreate" && c.recreer);
  const visibles = trierComptes(filtrerComptes(liste, filtres), tri);
  const jours = liste[0]?.jours.map((j) => j.jour) ?? [];

  const envoyer = useMutation({
    mutationFn: async () => {
      const r = nudges.length ? await validerNudgesJeudi(lundi, nudges.map((c) => c.compte_id)) : { prepares: 0, deja: 0, sans_canal: 0 };
      const f = r.prepares > 0 ? await envoyerFile() : null;
      const erreurs: string[] = [];
      let recrees = 0;
      for (const c of recreates) {
        try {
          if (c.recreer === "ckd" && c.ckd_jeudi_id) await deciderCkd(c.ckd_jeudi_id, "recreer", null);
          else await recreerShadowban(c.compte_id);
          recrees++;
        } catch (e) {
          erreurs.push(`@${c.handle ?? "?"} : ${(e as Error).message}`);
        }
      }
      return { ...r, partis: f?.envoyes ?? 0, attente: f?.upwork_bloque ?? 0, recrees, erreurs };
    },
    onSuccess: (r) => {
      setChoix({});
      setBilan(t("autoOnglets.decisions.liste.jeudi.bilan", r) + (r.erreurs.length ? ` · ${r.erreurs.join(" · ")}` : ""));
      void qc.invalidateQueries({ queryKey: ["semaine-comptes"] });
      void qc.invalidateQueries({ queryKey: ["ckd"] });
    },
  });

  return (
    <Card data-testid="liste-jeudi">
      <CardHeader>
        <CardTitle>{t("autoOnglets.decisions.liste.jeudi.titre", { n: liste.length })}</CardTitle>
        <CardDescription>{t("autoOnglets.decisions.liste.jeudi.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
        {lu.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        <BarreFiltres liste={liste} filtres={filtres} setFiltres={setFiltres} tri={tri} setTri={setTri} />
        <p className="text-xs text-muted-foreground">
          {t("autoOnglets.decisions.liste.affiches", { n: visibles.length, total: liste.length })}
        </p>
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.choix")}</th>
                <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.compte")}</th>
                <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.pays")}</th>
                <EnTetesJours jours={jours} />
                <th className={`${TH} text-right`}>{t("autoOnglets.decisions.liste.colonnes.total")}</th>
                <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.vues")}</th>
                <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.signaux")}</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.compte_id} className="border-b border-border/40" data-compte={c.handle ?? c.compte_id}>
                  <td className={TD}>
                    <Choix
                      valeur={choixDe(c)}
                      options={CHOIX}
                      libelle={(o) => t(`autoOnglets.decisions.liste.jeudi.choix.${o}`)}
                      desactives={[
                        ...(c.recreer ? [] : (["recreate"] as const)),
                        ...(c.nudge_envoye_at || c.nudge_en_file ? (["nudge"] as const) : []),
                      ]}
                      lecture={!admin}
                      onChange={(o) => setChoix((x) => ({ ...x, [c.compte_id]: o }))}
                    />
                    {c.nudge_envoye_at && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{t("autoOnglets.decisions.liste.jeudi.dejaNudge")}</p>
                    )}
                    {c.nudge_en_file && !c.nudge_envoye_at && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{t("autoOnglets.decisions.liste.jeudi.enFile")}</p>
                    )}
                  </td>
                  <td className={TD}>
                    <CelluleCompte c={c} />
                  </td>
                  <td className={`${TD} text-xs`}>{c.pays ?? "—"}</td>
                  <CellulesJours c={c} aujourdhui={aujourdhui} />
                  <td className={`${TD} text-right tabular-nums`}>
                    <span className={c.lien_total < attendusJusquIci(c) ? "font-semibold text-warning-foreground" : undefined}>
                      {c.lien_total}/{attendusJusquIci(c)}
                    </span>
                  </td>
                  <td className={TD}>
                    <CelluleVues c={c} />
                  </td>
                  <td className={TD}>
                    <Signaux c={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
          <Badge variant="info">{t("autoOnglets.decisions.liste.jeudi.compte", { nudges: nudges.length, recreates: recreates.length })}</Badge>
          {admin && (
            <Button
              data-action="envoyer-jeudi"
              loading={envoyer.isPending}
              disabled={nudges.length + recreates.length === 0}
              onClick={() => {
                if (window.confirm(t("autoOnglets.decisions.liste.jeudi.confirm", { nudges: nudges.length, recreates: recreates.length }))) envoyer.mutate();
              }}
            >
              {t("autoOnglets.decisions.liste.jeudi.envoyer")}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{t("autoOnglets.decisions.liste.jeudi.rythme")}</span>
        </div>
        {bilan && <p className="text-sm">{bilan}</p>}
        {envoyer.error && <p className="text-sm text-destructive">{(envoyer.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
