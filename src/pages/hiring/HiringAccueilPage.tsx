import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { Badge } from "@/components/ui/badge";
import { BarreChargement } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { lireCohorte, type CompteCohorte } from "@/features/ckd/cohorte/api";
import {
  aFaireAujourdhui,
  ligneSemaine,
  ligneWarmup,
  type Raison,
} from "@/features/ckd/cohorte/dashboardHm";
import { libelleCohorte, minuitParis, paireDuJour, resteAvant } from "@/features/ckd/cohorte/logique";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { supabase } from "@/lib/supabase/client";

/** Prénom + nom des posteurs (la RLS ne rend que ceux de la HM). */
async function nomsPosteurs(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, prenom, nom, email").in("id", ids);
  if (error) throw error;
  return new Map(
    (data ?? []).map((p) => [p.id as string, [p.prenom, p.nom].filter(Boolean).join(" ") || (p.email as string) || "—"]),
  );
}

function texteRaison(t: TFunction, r: Raison): string {
  return t(`accueilHm.raisons.${r.cle}`, r.valeurs);
}

function Handle({ compte }: { compte: CompteCohorte }) {
  if (!compte.handle) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={`https://www.tiktok.com/@${compte.handle}`}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline-offset-2 hover:underline"
    >
      @{compte.handle}
    </a>
  );
}

const TH = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const TD = "px-3 py-2 align-top";

function Tableau({ entetes, children }: { entetes: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {entetes.map((e) => (
              <th key={e} className={TH}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Page d'accueil de la HM : sa cohorte, en 3 blocs. Mêmes données que Check,
 * Kill or Double → Cohort tracking, limitées à ses posteurs (0360).
 */
export function HiringAccueilPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const aujourdhui = aujourdhuiParis();
  const { poste, warmup } = paireDuJour(aujourdhui);

  const donnees = useQuery({
    queryKey: ["accueil-hm", user?.id, poste],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const [enPoste, enWarmup] = await Promise.all([lireCohorte(poste), lireCohorte(warmup)]);
      // Admin et Head of Ops reçoivent toute la cohorte : on garde les leurs.
      const miens = (l: CompteCohorte[]) => l.filter((c) => c.hm_id === user!.id);
      const p = miens(enPoste);
      const w = miens(enWarmup);
      const noms = await nomsPosteurs([...new Set([...p, ...w].map((c) => c.poster_id))]);
      return { poste: p, warmup: w, noms };
    },
  });

  const nom = (c: CompteCohorte) => donnees.data?.noms.get(c.poster_id) ?? "—";
  const reste = resteAvant(minuitParis(warmup));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("accueilHm.titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("accueilHm.sous")}</p>
      </div>

      <BarreChargement actif={donnees.isLoading} />
      {donnees.error && <p className="text-sm text-destructive">{String((donnees.error as Error).message)}</p>}

      {donnees.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("accueilHm.aFaire")}</CardTitle>
              <CardDescription>{t("accueilHm.aFaireDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const lignes = aFaireAujourdhui(donnees.data.poste, donnees.data.warmup, aujourdhui);
                if (lignes.length === 0) return <p className="text-sm text-muted-foreground">{t("accueilHm.rienAFaire")}</p>;
                return (
                  <Tableau entetes={[t("accueilHm.posteur"), t("accueilHm.compte"), t("accueilHm.raison")]}>
                    {lignes.map((l) => (
                      <tr key={`${l.cohorte}-${l.compte.compte_id}`}>
                        <td className={TD}>{nom(l.compte)}</td>
                        <td className={TD}>
                          <Handle compte={l.compte} />
                        </td>
                        <td className={TD}>{l.raisons.map((r) => texteRaison(t, r)).join(" · ")}</td>
                      </tr>
                    ))}
                  </Tableau>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {t("accueilHm.cetteSemaine")} · {libelleCohorte(poste)}
              </CardTitle>
              <CardDescription>{t("accueilHm.cetteSemaineDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {donnees.data.poste.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("accueilHm.vide")}</p>
              ) : (
                <Tableau
                  entetes={[
                    t("accueilHm.posteur"),
                    t("accueilHm.compte"),
                    t("accueilHm.postsJour"),
                    t("accueilHm.postsSemaine"),
                    t("accueilHm.statut"),
                  ]}
                >
                  {donnees.data.poste.map((c) => {
                    const l = ligneSemaine(c, aujourdhui);
                    return (
                      <tr key={c.compte_id}>
                        <td className={TD}>{nom(c)}</td>
                        <td className={TD}>
                          <Handle compte={c} />
                        </td>
                        <td className={TD}>
                          {l.jour.prevus > 0 ? `${l.jour.publies}/${l.jour.prevus}` : "—"}
                        </td>
                        <td className={TD}>{`${l.semaine.publies}/${l.semaine.prevus}`}</td>
                        <td className={TD}>
                          <Badge variant={l.statut === "ok" ? "success" : "warning"}>
                            {t(`accueilHm.statuts.${l.statut}`)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </Tableau>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {t("accueilHm.semaineProchaine")} · {libelleCohorte(warmup)}
              </CardTitle>
              <CardDescription>
                {t("accueilHm.dateLimite")}
                {reste && ` ${t("accueilHm.reste", { jours: reste.jours, heures: reste.heures })}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {donnees.data.warmup.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("accueilHm.vide")}</p>
              ) : (
                <Tableau
                  entetes={[
                    t("accueilHm.posteur"),
                    t("accueilHm.compte"),
                    t("accueilHm.tiktok"),
                    t("accueilHm.warmup"),
                    t("accueilHm.start"),
                    t("accueilHm.statut"),
                  ]}
                >
                  {donnees.data.warmup.map((c) => {
                    const l = ligneWarmup(c, aujourdhui);
                    return (
                      <tr key={c.compte_id}>
                        <td className={TD}>{nom(c)}</td>
                        <td className={TD}>
                          <Handle compte={c} />
                        </td>
                        <td className={TD}>{t(`accueilHm.etatsTiktok.${l.etat.tiktok}`)}</td>
                        <td className={TD}>
                          {l.etat.abonnements === null
                            ? "—"
                            : t("accueilHm.followsLikes", { follows: l.etat.abonnements, likes: l.etat.likes ?? 0 })}
                        </td>
                        <td className={TD}>{l.etat.start ? t("accueilHm.oui") : t("accueilHm.non")}</td>
                        <td className={TD}>
                          <Badge
                            variant={l.statut === "pret" ? "success" : l.statut === "a_relancer" ? "warning" : "secondary"}
                          >
                            {t(`accueilHm.statuts.${l.statut}`)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </Tableau>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
