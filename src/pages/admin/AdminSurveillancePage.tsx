import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BellRing,
  ExternalLink,
  EyeOff,
  Lock,
  Trash2,
  Unlock,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { lienTikTok } from "@/features/hiring/suiviEquipe";
import {
  annulerSkipSurveillance,
  basculerHmDemande,
  basculerNonRenouveler,
  definirClassementManuel,
  deverrouillerClassement,
  envoyerNudge,
  lireReglages,
  listerPostsCompte,
  listerSurveillanceComptes,
  skipSurveillance,
  supprimerPost,
  type LigneSurveillance,
  type PostCompte,
} from "@/features/moteur/api";
import { BadgeClassement } from "@/features/moteur/BadgeClassement";
import {
  CLASSEMENTS,
  CLASSEMENT_REGLAGES_DEFAUT,
  estSkippe,
  estSousSurveillance,
  etatTrial,
  motifsSurveillance,
  rangClassement,
  type Classement,
  type ClassementReglages,
  type MotifSurveillance,
} from "@/features/moteur/classementComptes";
import { drapeauLangue } from "@/features/moteur/langues";
import type { ModeleNudge } from "@/features/moteur/types";

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function nomCompte(r: LigneSurveillance): string {
  return (
    r.poster_nom ||
    r.persona_nom ||
    (r.handle_tiktok ? `@${r.handle_tiktok.replace(/^@/, "")}` : r.compte_id.slice(0, 8))
  );
}

function libelleMotif(motif: MotifSurveillance, t: (cle: string) => string): string {
  if (motif === "inactif") return t("surveillance.motifInactif");
  if (motif === "mauvaises_vues") return t("surveillance.motifMauvaisesVues");
  return t("surveillance.motifTrial");
}

/** Ce qui a produit la case : « 8/10 posts publiés · 420 vues de moyenne ». */
function Rapport({ ligne }: { ligne: LigneSurveillance }) {
  const { t, i18n } = useTranslation();
  const r = ligne.classement_rapport;
  if (!r || r.prevus == null) {
    return <p className="text-xs text-muted-foreground">{t("classement.jamais")}</p>;
  }
  const morceaux = [
    t("classement.rapportPosts", { postes: r.postes ?? 0, prevus: r.prevus }),
    r.moyenne_vues != null
      ? t("classement.rapportVues", {
        vues: Math.round(r.moyenne_vues).toLocaleString(i18n.language),
      })
      : null,
    ligne.classement_maj_at
      ? t("classement.maj", {
        date: new Date(ligne.classement_maj_at).toLocaleDateString(i18n.language),
      })
      : null,
  ].filter(Boolean);
  return <p className="text-xs text-muted-foreground">{morceaux.join(" · ")}</p>;
}

function EnteteLigne({
  ligne,
  motifs,
  reglages,
}: {
  ligne: LigneSurveillance;
  motifs: MotifSurveillance[];
  reglages: ClassementReglages;
}) {
  const { t } = useTranslation();
  const trial = etatTrial(ligne.created_at, reglages);
  const tiktok = lienTikTok(ligne.handle_tiktok);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/admin/createurs/${ligne.compte_id}`}
          className="text-sm font-medium underline-offset-2 hover:underline"
        >
          {nomCompte(ligne)}
        </Link>
        {tiktok && (
          <a
            href={tiktok.url}
            target="_blank"
            rel="noreferrer"
            title={t("surveillance.lienTiktok")}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
          >
            {tiktok.at}
            <ExternalLink className="size-3" />
          </a>
        )}
        <span title={ligne.langue}>{drapeauLangue(ligne.langue)}</span>
        <BadgeClassement
          classement={ligne.classement}
          titre={ligne.classement_rapport?.regle ?? null}
        />
        {ligne.classement_verrou && (
          <Badge variant="outline" title={t("surveillance.changerCaseAide")}>
            <Lock className="size-3" />
            {ligne.classement_calcule
              ? t("classement.calcule", { case: t(`classement.${ligne.classement_calcule}`) })
              : t("classement.verrou")}
          </Badge>
        )}
        {trial.enTrial && (
          <Badge
            variant="info"
            title={t("surveillance.trialRestant", { h: Math.ceil(trial.heuresRestantes) })}
          >
            {t("surveillance.trial")} · {Math.ceil(trial.heuresRestantes)} h
          </Badge>
        )}
        {motifs.map((m) => (
          <Badge key={m} variant="secondary">
            {libelleMotif(m, t)}
          </Badge>
        ))}
      </div>
      <Rapport ligne={ligne} />
    </div>
  );
}

/** Un post est « posté » dès qu'il porte un lien ou une date de publication. */
function estPoste(post: PostCompte): boolean {
  return post.statut === "publie" || Boolean(post.publie_at) || Boolean(post.publie_url);
}

/**
 * Posts du compte, avec suppression unitaire. Ouvert à la demande depuis la
 * ligne de surveillance : inutile de charger le calendrier entier pour retirer
 * le post d'un compte qui ne poste plus.
 */
function PostsCompte({ compteId, nom }: { compteId: string; nom: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const posts = useQuery({
    queryKey: ["posts-compte", compteId],
    queryFn: () => listerPostsCompte(compteId),
  });

  const supprimer = useMutation({
    mutationFn: supprimerPost,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["posts-compte", compteId] });
      void queryClient.invalidateQueries({ queryKey: ["posts-calendrier-admin"] });
      void queryClient.invalidateQueries({ queryKey: ["publications-compte", compteId] });
    },
  });

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium">{t("surveillance.postsTitre")}</p>
      {posts.isPending && (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      )}
      {posts.isError && (
        <p className="text-xs text-destructive">
          {posts.error instanceof Error ? posts.error.message : String(posts.error)}
        </p>
      )}
      {supprimer.isError && (
        <p className="text-xs text-destructive">
          {t("surveillance.erreur", {
            msg:
              supprimer.error instanceof Error
                ? supprimer.error.message
                : String(supprimer.error),
          })}
        </p>
      )}
      {posts.data && posts.data.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("surveillance.postsVide")}</p>
      )}
      {(posts.data ?? []).map((post) => {
        const poste = estPoste(post);
        return (
          <div
            key={post.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-2"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge variant={poste ? "success" : "outline"}>
                {poste ? t("adminCal.poste") : t("adminCal.prevu")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {post.date_publication_prevue
                  ? new Date(post.date_publication_prevue).toLocaleDateString(i18n.language)
                  : post.publie_at
                    ? new Date(post.publie_at).toLocaleDateString(i18n.language)
                    : "—"}
              </span>
              <span className="truncate text-xs">
                {post.sujet_titre?.trim() || t("posts.title")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {post.publie_url && (
                <a
                  href={post.publie_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
                >
                  {t("adminCal.voirTiktok")}
                  <ExternalLink className="size-3" />
                </a>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={supprimer.isPending}
                onClick={() => {
                  if (window.confirm(t("adminCal.confirmSuppr", { nom }))) {
                    supprimer.mutate(post.id);
                  }
                }}
              >
                <Trash2 className="size-3.5" />
                {t("surveillance.supprimerPost")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LigneFile({
  ligne,
  reglages,
  modeles,
  pending,
  actions,
}: {
  ligne: LigneSurveillance;
  reglages: ClassementReglages;
  modeles: ModeleNudge[];
  pending: boolean;
  actions: {
    skip: () => void;
    annulerSkip: () => void;
    changerCase: (c: Classement) => void;
    deverrouiller: () => void;
    nudge: (m: ModeleNudge) => void;
    nePasRenouveler: () => void;
  };
}) {
  const { t, i18n } = useTranslation();
  const [modeleId, setModeleId] = React.useState(modeles[0]?.id ?? "");
  const [postsOuverts, setPostsOuverts] = React.useState(false);
  const motifs = motifsSurveillance(ligne, reglages);
  const skippe = estSkippe(ligne.surveillance_skip_jusqu);

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <EnteteLigne ligne={ligne} motifs={motifs} reglages={reglages} />

      {skippe && ligne.surveillance_skip_jusqu && (
        <p className="text-xs text-muted-foreground">
          {t("surveillance.skipJusqu", {
            date: new Date(ligne.surveillance_skip_jusqu).toLocaleDateString(i18n.language),
          })}
        </p>
      )}
      {ligne.dernier_nudge_at && (
        <p className="text-xs text-muted-foreground">
          {t("surveillance.nudgeDernier", {
            date: new Date(ligne.dernier_nudge_at).toLocaleDateString(i18n.language),
          })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {skippe ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={actions.annulerSkip}>
            {t("surveillance.annulerSkip")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            title={t("surveillance.skipAide", { n: reglages.skip_jours })}
            onClick={actions.skip}
          >
            <EyeOff className="size-3.5" />
            {t("surveillance.skip")}
          </Button>
        )}

        <label className="inline-flex items-center gap-1.5">
          <span className="sr-only">{t("surveillance.changerCase")}</span>
          <select
            className={selectClass}
            value={ligne.classement}
            disabled={pending}
            title={t("surveillance.changerCaseAide")}
            onChange={(e) => actions.changerCase(e.target.value as Classement)}
          >
            {CLASSEMENTS.map((c) => (
              <option key={c} value={c}>
                {t(`classement.${c}`)}
              </option>
            ))}
          </select>
        </label>
        {ligne.classement_verrou && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            title={t("surveillance.deverrouillerAide")}
            onClick={actions.deverrouiller}
          >
            <Unlock className="size-3.5" />
            {t("surveillance.deverrouiller")}
          </Button>
        )}

        {modeles.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {t("surveillance.nudgeAucunModele")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <select
              className={selectClass}
              value={modeleId}
              disabled={pending}
              onChange={(e) => setModeleId(e.target.value)}
            >
              {modeles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titre || m.corps.slice(0, 40)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !modeleId}
              title={t("surveillance.nudgeAide")}
              onClick={() => {
                const m = modeles.find((x) => x.id === modeleId);
                if (m) actions.nudge(m);
              }}
            >
              <BellRing className="size-3.5" />
              {t("surveillance.nudge")}
            </Button>
          </span>
        )}

        <Button
          size="sm"
          variant="outline"
          title={t("surveillance.supprimerPostAide")}
          aria-expanded={postsOuverts}
          onClick={() => setPostsOuverts((v) => !v)}
        >
          <Trash2 className="size-3.5" />
          {postsOuverts
            ? t("surveillance.supprimerPostFermer")
            : t("surveillance.supprimerPost")}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          title={t("surveillance.nePasRenouvelerAide")}
          onClick={actions.nePasRenouveler}
        >
          <AlertTriangle className="size-3.5" />
          {t("surveillance.nePasRenouveler")}
        </Button>
      </div>

      {postsOuverts && <PostsCompte compteId={ligne.compte_id} nom={nomCompte(ligne)} />}
    </div>
  );
}

function LigneNonRenouveler({
  ligne,
  reglages,
  pending,
  onHmDemande,
  onRetirer,
}: {
  ligne: LigneSurveillance;
  reglages: ClassementReglages;
  pending: boolean;
  onHmDemande: (valeur: boolean) => void;
  onRetirer: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <EnteteLigne ligne={ligne} motifs={[]} reglages={reglages} />
      {ligne.non_renouveler_at && (
        <p className="text-xs text-muted-foreground">
          {t("surveillance.ajouteLe", {
            date: new Date(ligne.non_renouveler_at).toLocaleDateString(i18n.language),
          })}
        </p>
      )}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={ligne.non_renouveler_hm_demande}
          disabled={pending}
          onCheckedChange={(valeur) => onHmDemande(Boolean(valeur))}
        />
        <span>
          {t("surveillance.hmDemande")}
          {ligne.non_renouveler_hm_demande && ligne.non_renouveler_hm_demande_at && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              {t("surveillance.hmDemandeFait", {
                date: new Date(ligne.non_renouveler_hm_demande_at).toLocaleDateString(
                  i18n.language,
                ),
              })}
            </span>
          )}
        </span>
      </label>
      <Button size="sm" variant="outline" disabled={pending} onClick={onRetirer}>
        {t("surveillance.retirerNonRenouv")}
      </Button>
    </div>
  );
}

export function AdminSurveillancePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [envoye, setEnvoye] = React.useState<string | null>(null);

  const comptes = useQuery({
    queryKey: ["surveillance-comptes"],
    queryFn: listerSurveillanceComptes,
  });
  const reglagesQuery = useQuery({ queryKey: ["reglages"], queryFn: lireReglages });

  const reglages = reglagesQuery.data?.classement_comptes ?? CLASSEMENT_REGLAGES_DEFAUT;
  const modeles = reglagesQuery.data?.nudges.modeles ?? [];

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ["surveillance-comptes"] });
  };

  const action = useMutation({
    mutationFn: (travail: () => Promise<void>) => travail(),
    onSuccess: () => {
      setErreur(null);
      rafraichir();
    },
    onError: (e: unknown) => {
      setErreur(e instanceof Error ? e.message : String(e));
    },
  });
  const lancer = (travail: () => Promise<void>) => action.mutate(travail);

  // Les plus graves d'abord, puis les fins d'essai, puis par nom.
  const file = React.useMemo(() => {
    const rows = (comptes.data ?? []).filter((r) => estSousSurveillance(r, reglages));
    return rows.sort((a, b) => {
      const ra = rangClassement(a.classement);
      const rb = rangClassement(b.classement);
      if (ra !== rb) return ra - rb;
      return nomCompte(a).localeCompare(nomCompte(b));
    });
  }, [comptes.data, reglages]);

  const nonRenouveler = React.useMemo(
    () => (comptes.data ?? []).filter((r) => r.non_renouveler),
    [comptes.data],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t("surveillance.title")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("surveillance.subtitle")}</p>
      </div>

      {erreur && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {t("surveillance.erreur", { msg: erreur })}
        </p>
      )}
      {envoye && (
        <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm">
          {t("surveillance.nudgeEnvoye", { nom: envoye })}
        </p>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{t("surveillance.fileTitre")}</CardTitle>
            <Badge variant="secondary">{t("surveillance.compteur", { n: file.length })}</Badge>
          </div>
          <CardDescription>{t("surveillance.fileDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {comptes.isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : file.length === 0 ? (
            <EmptyState title={t("surveillance.fileVide")} />
          ) : (
            file.map((ligne) => (
              <LigneFile
                key={ligne.compte_id}
                ligne={ligne}
                reglages={reglages}
                modeles={modeles}
                pending={action.isPending}
                actions={{
                  skip: () => lancer(() => skipSurveillance(ligne.compte_id)),
                  annulerSkip: () => lancer(() => annulerSkipSurveillance(ligne.compte_id)),
                  changerCase: (c) =>
                    lancer(() => definirClassementManuel(ligne.compte_id, c)),
                  deverrouiller: () => lancer(() => deverrouillerClassement(ligne.compte_id)),
                  nudge: (m) =>
                    lancer(async () => {
                      await envoyerNudge(ligne.compte_id, m, ligne.classement);
                      setEnvoye(nomCompte(ligne));
                    }),
                  nePasRenouveler: () =>
                    lancer(() => basculerNonRenouveler(ligne.compte_id, true)),
                }}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{t("surveillance.nonRenouvTitre")}</CardTitle>
            <Badge variant="secondary">
              {t("surveillance.compteur", { n: nonRenouveler.length })}
            </Badge>
          </div>
          <CardDescription>{t("surveillance.nonRenouvDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {nonRenouveler.length === 0 ? (
            <EmptyState title={t("surveillance.nonRenouvVide")} />
          ) : (
            nonRenouveler.map((ligne) => (
              <LigneNonRenouveler
                key={ligne.compte_id}
                ligne={ligne}
                reglages={reglages}
                pending={action.isPending}
                onHmDemande={(valeur) =>
                  lancer(() => basculerHmDemande(ligne.compte_id, valeur))
                }
                onRetirer={() => lancer(() => basculerNonRenouveler(ligne.compte_id, false))}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
