import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { Badge } from "@/components/ui/badge";
import { BarreChargement } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { listerShadowban } from "@/features/ckd/api";
import { lireCohorte, type CompteCohorte } from "@/features/ckd/cohorte/api";
import { CelluleExigences } from "@/features/ckd/cohorte/CelluleExigences";
import { lireReposts } from "@/features/ckd/cohorte/exigences";
import { DiagnosticCompte } from "@/features/ckd/DiagnosticCompte";
import { SectionsSamediHm } from "@/features/ckd/SectionsSamediHm";
import { etatCohorte } from "@/features/ckd/cohorte/etapeCohorte";
import { EtapeBadge, QualiteBadge } from "@/features/moteur/EtapeBadge";
import { qualiteAffichee } from "@/features/moteur/etapes";
import { lireEtapesComptes } from "@/features/moteur/etapesApi";
import {
  aFaireAujourdhui,
  ligneSemaine,
  ligneWarmup,
  type Raison,
} from "@/features/ckd/cohorte/dashboardHm";
import { libelleCohorte, minuitParis, paireDuJour, resteAvant } from "@/features/ckd/cohorte/logique";
import { aujourdhuiParis, semaineIso } from "@/features/moteur/cohortes";
import { SectionPaieHm } from "@/features/paie/SectionPaieHm";
import { usePaieHm } from "@/features/paie/usePaieHm";
import { dollars, totaux } from "@/features/paie/logique";
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
  const { t, i18n } = useTranslation();
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
      const [noms, reposts] = await Promise.all([
        nomsPosteurs([...new Set([...p, ...w].map((c) => c.poster_id))]),
        lireReposts(w.map((c) => c.compte_id)),
      ]);
      return { poste: p, warmup: w, noms, reposts };
    },
  });

  // Comptes signalés par Check, Kill or Double → Shadowban (0362), les siens.
  const signales = useQuery({
    queryKey: ["accueil-hm", "shadowban", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const lignes = (await listerShadowban()).filter((l) => l.hm_id === user!.id);
      return { lignes, noms: await nomsPosteurs([...new Set(lignes.map((l) => l.poster_id))]) };
    },
  });
  // Le tag qualité (GOOD / POOR VIEWS / SHADOWBAN) : d'après la base (0363).
  const etapes = useQuery({ queryKey: ["etapes-comptes"], queryFn: lireEtapesComptes, enabled: Boolean(user?.id) });
  const { semaine: semainePaie, paie } = usePaieHm(user?.id);
  const paieAFaire = totaux(paie.data ?? []);
  const langue = i18n.resolvedLanguage ?? "fr";

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
              {paieAFaire.aPayer > 0 && (
                <p className="mb-3 rounded-md border border-warning/40 bg-warning/8 px-3 py-2 text-sm font-medium">
                  {t("accueilHm.paieAFaire", {
                    semaine: semaineIso(semainePaie),
                    n: paieAFaire.aPayer,
                    montant: dollars(paieAFaire.resteAPayer, langue),
                  })}
                </p>
              )}
              {(signales.data?.lignes.length ?? 0) > 0 && (
                <div className="mb-3 space-y-3" data-testid="accueil-shadowban">
                  {signales.data!.lignes.map((l) => (
                    <div key={l.compte_id} className="space-y-1">
                      <p className="text-sm">
                        <span className="font-medium">{signales.data!.noms.get(l.poster_id) ?? "—"}</span>
                        {l.handle && (
                          <>
                            {" · "}
                            <a
                              href={`https://www.tiktok.com/@${l.handle}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              @{l.handle}
                            </a>
                          </>
                        )}
                        {" · "}
                        {t(`ckd.shadowban.types.${l.type}`)}
                      </p>
                      <DiagnosticCompte diagnostic={l.diagnostic} />
                    </div>
                  ))}
                </div>
              )}
              {(() => {
                const lignes = aFaireAujourdhui(donnees.data.poste, donnees.data.warmup, aujourdhui);
                if (lignes.length === 0)
                  return paieAFaire.aPayer > 0 || (signales.data?.lignes.length ?? 0) > 0 ? null : (
                    <p className="text-sm text-muted-foreground">{t("accueilHm.rienAFaire")}</p>
                  );
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

          <SectionsSamediHm />

          <SectionPaieHm hmId={user?.id} />

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
                    t("accueilHm.etape"),
                    t("accueilHm.postsJour"),
                    t("accueilHm.postsSemaine"),
                    t("accueilHm.statut"),
                  ]}
                >
                  {donnees.data.poste.map((c) => {
                    const l = ligneSemaine(c, aujourdhui);
                    const etat = etatCohorte(c, aujourdhui);
                    return (
                      <tr key={c.compte_id}>
                        <td className={TD}>{nom(c)}</td>
                        <td className={TD}>
                          <Handle compte={c} />
                        </td>
                        <td className={TD}>
                          <span className="inline-flex flex-wrap gap-1">
                            <EtapeBadge etat={etat} />
                            <QualiteBadge qualite={qualiteAffichee(etat, etapes.data?.get(c.compte_id)?.qualite)} />
                          </span>
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
                    t("accueilHm.etape"),
                    t("accueilHm.tiktok"),
                    t("accueilHm.warmup"),
                    t("ckd.exigences.colonne"),
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
                        <td className={TD}>
                          <EtapeBadge etat={etatCohorte(c, aujourdhui)} />
                        </td>
                        <td className={TD}>{t(`accueilHm.etatsTiktok.${l.etat.tiktok}`)}</td>
                        <td className={TD}>
                          {l.etat.abonnements === null
                            ? "—"
                            : t("accueilHm.followsLikes", { follows: l.etat.abonnements, likes: l.etat.likes ?? 0 })}
                        </td>
                        <td className={TD}>
                          <CelluleExigences etat={l.etat} repostsAt={donnees.data.reposts.get(c.compte_id)} />
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
