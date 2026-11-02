import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type { TFunction } from "i18next";

import { Badge } from "@/components/ui/badge";
import { BarreChargement } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { BoutonExport } from "@/features/export/BoutonExport";
import { CalendrierSemaine } from "@/features/ckd/calendrier/CalendrierSemaine";
import { AnciensPosteurs } from "@/features/ckd/anciens/AnciensPosteurs";
import { SemaineProchaine } from "@/features/ckd/semaineProchaine/SemaineProchaine";
import { ChoixHm } from "@/features/ckd/vueHm/ChoixHm";
import { listerShadowban } from "@/features/ckd/api";
import { lireCohorte, type CompteCohorte } from "@/features/ckd/cohorte/api";
import { DiagnosticCompte } from "@/features/ckd/DiagnosticCompte";
import { ActionsPosteur } from "@/features/ckd/cohorte/ActionsPosteur";
import {
  aFaireAujourdhui,
  aPublie,
  type Raison,
} from "@/features/ckd/cohorte/dashboardHm";
import { paireDuJour } from "@/features/ckd/cohorte/logique";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SuiviMessages } from "@/features/messagesPosteurs/SuiviMessages";
import { CeQueLOsAFait } from "@/features/nudges/CeQueLOsAFait";
import { MesRecrues } from "@/features/cohortes/PageCohortes";
import { AccueilAuto } from "@/features/accueil/AccueilAuto";
import { SectionsSamediHm } from "@/features/ckd/SectionsSamediHm";
import { EnvoisMain } from "@/features/envoisMain/EnvoisMain";

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
/** 1/11 : « My cohort » ouverte depuis « Create a poster » (?posteur=…) : la recrue qui existe déjà, en tête. */
function VotreRecrue() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const id = params.get("posteur");
  const lu = useQuery({
    queryKey: ["votre-recrue", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("prenom, nom, cohorte_lundi").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as { prenom: string | null; nom: string | null; cohorte_lundi: string | null } | null;
    },
  });
  if (!id || !lu.data) return null;
  return (
    <Card data-testid="votre-recrue" className="border-primary">
      <CardContent className="p-3 text-sm font-medium">
        {t("hiring.creationCoupee.votreRecrue", {
          nom: [lu.data.prenom, lu.data.nom].filter(Boolean).join(" ") || "—",
          cohorte: lu.data.cohorte_lundi ?? "—",
        })}
      </CardContent>
    </Card>
  );
}

export function HiringAccueilPage() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  // Le Head of Ops choisit la HM des blocs Cette semaine et Semaine prochaine.
  const [hm, setHm] = React.useState("");
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

  // Comptes signalés par Check, Kill or Double → Shadowban (0362), les siens.
  const signales = useQuery({
    queryKey: ["accueil-hm", "shadowban", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const lignes = (await listerShadowban()).filter((l) => l.hm_id === user!.id);
      return { lignes, noms: await nomsPosteurs([...new Set(lignes.map((l) => l.poster_id))]) };
    },
  });

  const nom = (c: CompteCohorte) => donnees.data?.noms.get(c.poster_id) ?? "—";

  return (
    <div className="space-y-6">
      <VotreRecrue />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{t("accueilHm.titre")}</h1>
        <BoutonExport hm={hm} />
      </div>
      {role === "head_of_ops" && <ChoixHm valeur={hm} onChange={setHm} />}

      {/* Prompt 25 v4 : Upwork plein, les messages à envoyer à la main (en premier). */}
      <EnvoisMain />

      {/* Prompt 21, D : en haut, ses cibles de recrutement (cible, recrutés, écart). */}
      <SectionsSamediHm decisions={false} prochaines />

      {/* Système du 2 nov., partie A : les contrats dont l'annonce ne dit pas le pays. */}
      <AccueilAuto hmSeulement />

      <BarreChargement actif={donnees.isLoading} />
      {donnees.error && <p className="text-sm text-destructive">{String((donnees.error as Error).message)}</p>}

      {donnees.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("accueilHm.aFaire")}</CardTitle>
            </CardHeader>
            <CardContent>
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
                  return (signales.data?.lignes.length ?? 0) > 0 ? null : (
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

          {/* 28 oct. : les décisions du samedi ne sont plus sur l'accueil des HMs, elles n'ont rien à faire. */}

          <CeQueLOsAFait />

          {/* Prompt 17, partie B : ses recrues, en lecture seule (le bloc complet vient en partie C). */}
          <MesRecrues hm={role === "head_of_ops" ? hm : undefined} />

          <CalendrierSemaine hm={hm} />

          <SemaineProchaine hm={hm} />

          <AnciensPosteurs hm={hm} />
          <SuiviMessages admin={false} />
        </>
      )}
    </div>
  );
}
