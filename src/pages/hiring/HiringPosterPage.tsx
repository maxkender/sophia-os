import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Trash2, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarreChargement } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import {
  creerPoster,
  listerLanguesReference,
  listerPosters,
  majCompte,
  supprimerPoster,
} from "@/features/moteur/api";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import type { PosterProfil } from "@/features/moteur/types";

/** Mot de passe commun à tous les posters (dicté de vive voix). */
const MOT_DE_PASSE = "12345678";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Une ligne créateur côté HM : identité TikTok (avatar, @, nom, source, bio),
 * ÉDITABLE (nom, @, bio). Le HM a recruté ce créateur, il peut ajuster son
 * identité (RLS `comptes_update_hiring`). La source et les ratios restent côté
 * admin. L'affichage se met à jour dès qu'on enregistre (invalidation ["posters"]).
 */
function LignePoster({ poster: p }: { poster: PosterProfil }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [edite, setEdite] = React.useState(false);
  const [nom, setNom] = React.useState(p.persona_nom ?? "");
  const [handle, setHandle] = React.useState(p.handle_tiktok ?? "");
  const [bio, setBio] = React.useState(p.persona_bio ?? "");

  const enregistrer = useMutation({
    mutationFn: () =>
      majCompte(p.compte_id!, {
        persona_nom: nom.trim() || null,
        handle_tiktok: handle.trim().replace(/^@/, "") || null,
        persona_bio: bio.trim() || null,
      }),
    onSuccess: () => {
      setEdite(false);
      queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });
  const supprimer = useMutation({
    mutationFn: () => supprimerPoster(p.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posters"] }),
  });

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      {p.avatar_url ? (
        <img src={p.avatar_url} alt="" className="size-11 shrink-0 rounded-full border object-cover" />
      ) : (
        <div className="size-11 shrink-0 rounded-full border bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {[p.prenom, p.nom].filter(Boolean).join(" ") || p.email}
          </span>
          {!p.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
          <WarmupBadge
            compteId={p.compte_id}
            startedAt={p.warmup_started_at}
            endsAt={p.warmup_ends_at}
          />
          {!edite && (
            <span className="ml-auto flex items-center gap-3">
              {p.compte_id && (
                <button
                  type="button"
                  onClick={() => setEdite(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                >
                  <Pencil className="size-3" />
                  {t("common.edit")}
                </button>
              )}
              <button
                type="button"
                disabled={supprimer.isPending}
                onClick={() => {
                  if (window.confirm(t("hiring.confirmSuppr", { nom: [p.prenom, p.nom].filter(Boolean).join(" ") || p.email })))
                    supprimer.mutate();
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-destructive"
              >
                <Trash2 className="size-3" />
                {t("common.delete")}
              </button>
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{p.email}</p>

        <div className="mt-1.5 space-y-1 border-t pt-1.5">
          {edite ? (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`nom-${p.id}`} className="text-xs">
                    {t("comptes.nomAffiche")}
                  </Label>
                  <Input id={`nom-${p.id}`} value={nom} onChange={(e) => setNom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`h-${p.id}`} className="text-xs">
                    {t("comptes.pseudo")}
                  </Label>
                  <Input id={`h-${p.id}`} value={handle} onChange={(e) => setHandle(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`bio-${p.id}`} className="text-xs">
                  {t("comptes.bioProposee")}
                </Label>
                <textarea
                  id={`bio-${p.id}`}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
                  <Check className="size-4" />
                  {enregistrer.isPending ? t("common.saving") : t("common.save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEdite(false)}>
                  <X className="size-4" />
                  {t("common.cancel")}
                </Button>
              </div>
              {enregistrer.isError && (
                <p className="text-xs text-destructive">{(enregistrer.error as Error).message}</p>
              )}
            </div>
          ) : p.handle_tiktok ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                <a
                  href={`https://www.tiktok.com/@${p.handle_tiktok.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  @{p.handle_tiktok.replace(/^@/, "")}
                </a>
                {p.persona_nom && <span className="text-muted-foreground">{p.persona_nom}</span>}
                {p.reference_handle && (
                  <span className="text-muted-foreground">
                    {t("hiring.source")} @{p.reference_handle.replace(/^@/, "")}
                  </span>
                )}
              </div>
              {p.persona_bio && (
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{p.persona_bio}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t("hiring.identiteEnCours")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Écran unique du hiring manager : créer un poster. Il saisit prénom, nom et
 * choisit la LANGUE ; le compte de référence et la persona (pseudo, bio, avatar)
 * sont générés automatiquement par l'IA côté serveur.
 */
export function HiringPosterPage() {
  const { t } = useTranslation();
  const { profil } = useAuth();
  const queryClient = useQueryClient();

  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });

  const [prenom, setPrenom] = React.useState("");
  const [nom, setNom] = React.useState("");
  const [langue, setLangue] = React.useState("");
  const [postsParJour, setPostsParJour] = React.useState<1 | 2 | 3>(2);
  const [cree, setCree] = React.useState<{ email: string; persona: boolean } | null>(null);

  // Langues gérées par le recruteur : un créateur = une langue, choisie à
  // chaque embauche. Plusieurs langues gérées → créateurs de langues différentes.
  // Aucune langue posée (ex. admin) → toutes les langues cibles.
  const modeUgcAiVideo = Boolean(profil?.hm_ugc_ai_video);
  const mesLangues = (profil?.langues ?? []).filter((l) => langues.data?.includes(l));
  const languesChoix = mesLangues.length > 0 ? mesLangues : (langues.data ?? []);

  React.useEffect(() => {
    if (!languesChoix.length) return;
    if (langue && languesChoix.includes(langue)) return;
    setLangue(languesChoix[0]!);
  }, [languesChoix, langue]);

  const creer = useMutation({
    mutationFn: () =>
      creerPoster({
        prenom,
        nom,
        password: MOT_DE_PASSE,
        langue,
        posts_par_jour: postsParJour,
      }),
    onSuccess: (r) => {
      setCree({ email: r.email, persona: Boolean(r.compte?.persona) });
      setPrenom("");
      setNom("");
      setPostsParJour(2);
      queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            {t("hiring.title")}
          </CardTitle>
          <CardDescription>
            {modeUgcAiVideo ? t("hiring.subtitleUgcAiVideo") : t("hiring.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setCree(null);
              creer.mutate();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="prenom">{t("posters.prenom")}</Label>
              <Input id="prenom" required value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nom">{t("posters.nom")}</Label>
              <Input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="langue">{t("hiring.langue")}</Label>
              <select
                id="langue"
                className={selectClass}
                value={langue}
                onChange={(e) => setLangue(e.target.value)}
                required
              >
                {languesChoix.length === 0 && (
                  <option value="">{t("hiring.aucuneLangue")}</option>
                )}
                {languesChoix.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t("hiring.langueAide")}</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("hiring.postsParJour")}</Label>
              <div className="inline-flex rounded-md border p-0.5">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPostsParJour(n)}
                    className={
                      postsParJour === n
                        ? "rounded px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground"
                        : "rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("hiring.postsParJourAide")}</p>
            </div>
            <div className="sm:col-span-2 space-y-3">
              <Button type="submit" disabled={creer.isPending || !langue}>
                {creer.isPending ? t("hiring.enCours") : t("hiring.create")}
              </Button>
              {/* L'identité (pseudo + bio + avatar) se génère en ~10-12 s : une
                  barre pour suivre l'attente, plutôt qu'un simple « en cours ». */}
              <BarreChargement
                actif={creer.isPending}
                dureeMs={13_000}
                label={t("hiring.progressIdentite")}
              />
              {creer.isError && (
                <p className="mt-2 text-sm text-destructive">
                  {(creer.error as Error).message === "NO_FREE_REFERENCE"
                    ? t("posters.plusDeReference")
                    : (creer.error as Error).message === "NO_LABELS"
                      ? t("warmup.aucunLabel")
                      : (creer.error as Error).message === "NO_UGC_PERSONA"
                        ? t("warmup.plusDePersonaUgc")
                        : (creer.error as Error).message === "NO_UGC_LABEL"
                          ? t("warmup.labelUgcIntrouvable")
                          : (creer.error as Error).message}
                </p>
              )}
            </div>
          </form>

          {cree && (
            <div className="space-y-1 rounded-lg border border-success/40 bg-success/5 p-4">
              <p className="text-sm font-medium text-success">{t("posters.done")}</p>
              <p className="text-sm">
                <span className="text-muted-foreground">{t("posters.emailGenere")} : </span>
                <code className="rounded bg-muted px-1">{cree.email}</code>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">{t("posters.password")} : </span>
                <code className="rounded bg-muted px-1">{MOT_DE_PASSE}</code>
              </p>
              <p className="pt-1 text-xs text-muted-foreground">
                {cree.persona ? t("hiring.personaOk") : t("hiring.personaPlusTard")}
              </p>
              <p className="text-xs text-muted-foreground">{t("warmup.apresCreation")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-5">
          {posters.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {posters.data?.filter((p) => p.role === "poster").length === 0 && (
            <EmptyState title={t("posters.empty")} />
          )}
          {posters.data
            ?.filter((p) => p.role === "poster")
            .map((p) => <LignePoster key={p.id} poster={p} />)}
        </CardContent>
      </Card>
    </div>
  );
}
