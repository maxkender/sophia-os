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
import { ActionsPosteur } from "@/features/ckd/cohorte/ActionsPosteur";
import {
  aFaireAujourdhui,
  aPublie,
  ligneSemaine,
  ligneWarmup,
  problemesSemaine,
  type Raison,
} from "@/features/ckd/cohorte/dashboardHm";
import { libelleCohorte, minuitParis, paireDuJour, resteAvant } from "@/features/ckd/cohorte/logique";
import { aujourdhuiParis, semaineIso } from "@/features/moteur/cohortes";
import { SectionPaieHm } from "@/features/paie/SectionPaieHm";
import { usePaieHm } from "@/features/paie/usePaieHm";
import { dollars, totaux } from "@/features/paie/logique";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

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

function initiales(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Le posteur et son compte TikTok, dans une seule cellule. */
function Posteur({ nom, compte }: { nom: string; compte: { handle: string | null } }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-[11px] text-primary"
      >
        {initiales(nom)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium">{nom}</p>
        {compte.handle ? (
          <a
            href={`https://www.tiktok.com/@${compte.handle}`}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            @{compte.handle}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

/** « 1/2 » avec une petite barre : vert si complet, orange si en retard. */
function Progression({ fait, prevu }: { fait: number; prevu: number }) {
  if (prevu === 0) return <span className="text-muted-foreground">—</span>;
  const part = Math.min(1, fait / prevu);
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 tabular-nums">
        {fait}/{prevu}
      </span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", part >= 1 ? "bg-success" : part > 0 ? "bg-warning" : "bg-transparent")}
          style={{ width: `${part * 100}%` }}
        />
      </span>
    </div>
  );
}

/** Résumé en tête de carte : « 12 creators · 9 OK · 3 follow up ». */
function Resume({ items }: { items: { libelle: string; ton?: "ok" | "alerte" | "neutre" }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {items.map((i) => (
        <span
          key={i.libelle}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs tabular-nums",
            i.ton === "ok" && "border-success/40 bg-success/8 text-success-foreground",
            i.ton === "alerte" && "border-warning/50 bg-warning/10 text-warning-foreground",
            (!i.ton || i.ton === "neutre") && "text-muted-foreground",
          )}
        >
          {i.libelle}
        </span>
      ))}
    </div>
  );
}

/** Le problème du compte, en clair ; « OK » s'il n'y en a pas. */
function Problemes({ raisons, t }: { raisons: Raison[]; t: TFunction }) {
  if (raisons.length === 0) return <Badge variant="success">{t("accueilHm.statuts.ok")}</Badge>;
  return (
    <span className="flex flex-col items-start gap-1">
      {raisons.map((r) => (
        <Badge key={r.cle} variant={r.cle === "sansWarmup" || r.cle === "compteIntrouvable" ? "error" : "warning"}>
          {texteRaison(t, r)}
        </Badge>
      ))}
    </span>
  );
}

const TH = "px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-4 py-3 align-middle";

function Tableau({ entetes, children }: { entetes: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b">
            {entetes.map((e, i) => (
              <th key={`${e}-${i}`} className={TH}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y [&>tr]:transition-colors [&>tr:hover]:bg-muted/30">{children}</tbody>
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
                  <Tableau entetes={[t("accueilHm.posteur"), t("accueilHm.raison"), ""]}>
                    {lignes.map((l) => (
                      <tr key={`${l.cohorte}-${l.compte.compte_id}`}>
                        <td className={TD}>
                          <Posteur nom={nom(l.compte)} compte={l.compte} />
                        </td>
                        <td className={TD}>
                          <span className="flex flex-wrap gap-1">
                            {l.raisons.map((r) => (
                              <Badge key={r.cle} variant="warning">
                                {texteRaison(t, r)}
                              </Badge>
                            ))}
                          </span>
                        </td>
                        <td className={cn(TD, "w-10 text-right")}>
                          <ActionsPosteur
                            posteurId={l.compte.poster_id}
                            nom={nom(l.compte)}
                            compteId={l.compte.compte_id}
                            warmupLance={Boolean(l.compte.warmup_lance_le)}
                            aPublie={aPublie(l.compte)}
                          />
                        </td>
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
              {donnees.data.poste.length > 0 && (() => {
                const lignes = donnees.data.poste;
                const aRelancer = lignes.filter(
                  (c) => problemesSemaine(c, etatCohorte(c, aujourdhui), aujourdhui).length > 0,
                ).length;
                return (
                  <Resume
                    items={[
                      { libelle: t("accueilHm.resume.posteurs", { count: lignes.length }) },
                      { libelle: t("accueilHm.resume.ok", { n: lignes.length - aRelancer }), ton: "ok" },
                      ...(aRelancer > 0
                        ? [{ libelle: t("accueilHm.resume.aRelancer", { n: aRelancer }), ton: "alerte" as const }]
                        : []),
                    ]}
                  />
                );
              })()}
            </CardHeader>
            <CardContent>
              {donnees.data.poste.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("accueilHm.vide")}</p>
              ) : (
                <Tableau
                  entetes={[
                    t("accueilHm.posteur"),
                    t("accueilHm.etape"),
                    t("accueilHm.postsJour"),
                    t("accueilHm.postsSemaine"),
                    t("accueilHm.probleme"),
                    "",
                  ]}
                >
                  {donnees.data.poste
                    .map((c) => {
                      const etat = etatCohorte(c, aujourdhui);
                      return { c, l: ligneSemaine(c, aujourdhui), etat, problemes: problemesSemaine(c, etat, aujourdhui) };
                    })
                    // Ceux qui ont un problème d'abord, puis par nom.
                    .sort(
                      (a, b) =>
                        Number(b.problemes.length > 0) - Number(a.problemes.length > 0) ||
                        nom(a.c).localeCompare(nom(b.c)),
                    )
                    .map(({ c, l, etat, problemes }) => {
                      return (
                        <tr key={c.compte_id}>
                          <td className={TD}>
                            <Posteur nom={nom(c)} compte={c} />
                          </td>
                          <td className={TD}>
                            <span className="inline-flex flex-wrap gap-1">
                              <EtapeBadge etat={etat} />
                              <QualiteBadge qualite={qualiteAffichee(etat, etapes.data?.get(c.compte_id)?.qualite)} />

                            </span>
                          </td>
                          <td className={TD}>
                            <Progression fait={l.jour.publies} prevu={l.jour.prevus} />
                          </td>
                          <td className={TD}>
                            <Progression fait={l.semaine.publies} prevu={l.semaine.prevus} />
                          </td>
                          <td className={TD}>
                            <Problemes raisons={problemes} t={t} />
                          </td>
                          <td className={cn(TD, "w-10 text-right")}>
                            <ActionsPosteur
                              posteurId={c.poster_id}
                              nom={nom(c)}
                              compteId={c.compte_id}
                              warmupLance={Boolean(c.warmup_lance_le)}
                              aPublie={aPublie(c)}
                            />
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
              {donnees.data.warmup.length > 0 && (() => {
                const lignes = donnees.data.warmup.map((c) => ligneWarmup(c, aujourdhui));
                const n = (s: string) => lignes.filter((l) => l.statut === s).length;
                return (
                  <Resume
                    items={[
                      { libelle: t("accueilHm.resume.posteurs", { count: lignes.length }) },
                      { libelle: t("accueilHm.resume.prets", { n: n("pret") }), ton: "ok" },
                      { libelle: t("accueilHm.resume.enCours", { n: n("en_cours") }) },
                      ...(n("a_relancer") > 0
                        ? [{ libelle: t("accueilHm.resume.aRelancer", { n: n("a_relancer") }), ton: "alerte" as const }]
                        : []),
                    ]}
                  />
                );
              })()}
            </CardHeader>
            <CardContent>
              {donnees.data.warmup.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("accueilHm.vide")}</p>
              ) : (
                <Tableau
                  entetes={[
                    t("accueilHm.posteur"),
                    t("accueilHm.etape"),
                    t("accueilHm.tiktok"),
                    t("accueilHm.warmup"),
                    t("ckd.exigences.colonne"),
                    t("accueilHm.start"),
                    t("accueilHm.statut"),
                    "",
                  ]}
                >
                  {donnees.data.warmup.map((c) => {
                    const l = ligneWarmup(c, aujourdhui);
                    return (
                      <tr key={c.compte_id}>
                        <td className={TD}>
                          <Posteur nom={nom(c)} compte={c} />
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
                        <td className={TD}>
                          <Badge variant={l.etat.start ? "success" : "outline"}>
                            {l.etat.start ? t("accueilHm.oui") : t("accueilHm.non")}
                          </Badge>
                        </td>
                        <td className={TD}>
                          {l.statut === "a_relancer" ? (
                            <Problemes raisons={l.raisons} t={t} />
                          ) : (
                            <Badge variant={l.statut === "pret" ? "success" : "secondary"}>
                              {t(`accueilHm.statuts.${l.statut}`)}
                            </Badge>
                          )}
                        </td>
                        <td className={cn(TD, "w-10 text-right")}>
                          <ActionsPosteur
                            posteurId={c.poster_id}
                            nom={nom(c)}
                            compteId={c.compte_id}
                            warmupLance={Boolean(c.warmup_lance_le)}
                            aPublie={aPublie(c)}
                          />
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
