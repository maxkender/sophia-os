import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft, Check, Pencil, Trash2, UserPlus, X } from "lucide-react";

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
import { nomProfil } from "@/features/hiring/suiviEquipe";
import {
  creerPoster,
  deplacerCompte,
  listerApplications,
  listerLanguesReference,
  listerPosters,
  majCompte,
  supprimerPoster,
} from "@/features/moteur/api";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { SLUG_SOPHIA } from "@/features/moteur/applications";
import { ChampsPremierCompte, type PremierCompte } from "@/features/moteur/ChampsPremierCompte";
import { langueInitiale } from "@/features/moteur/langues";
import {
  comptePrincipal,
  destinationsDeplacementCompte,
  estCompteCm,
  languesCmPrises,
} from "@/features/moteur/comptesCm";
import { FormulaireAjouterCompte } from "@/features/moteur/FormulaireCompteCm";
import { EnteteCompte } from "@/features/moteur/VignetteCompte";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import type { CompteResumePoster, PosterProfil } from "@/features/moteur/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Mot de passe commun à tous les posters (dicté de vive voix). */
const MOT_DE_PASSE = "12345678";

function libelleCompte(c: CompteResumePoster): string {
  const handle = c.handle_tiktok?.replace(/^@+/, "");
  if (handle) return `@${handle}`;
  return c.persona_nom?.trim() || c.id.slice(0, 8);
}

function DeplacerCompte({
  compte,
  source,
  createurs,
}: {
  compte: CompteResumePoster;
  source: PosterProfil;
  createurs: PosterProfil[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const dests = React.useMemo(
    () => destinationsDeplacementCompte(compte, source.id, createurs),
    [compte, source.id, createurs],
  );
  const destIds = dests.map((d) => d.id).join(",");
  const [ouvert, setOuvert] = React.useState(false);
  const [destId, setDestId] = React.useState(dests[0]?.id ?? "");

  React.useEffect(() => {
    const ids = destIds ? destIds.split(",") : [];
    setDestId((actuel) => (actuel && ids.includes(actuel) ? actuel : (ids[0] ?? "")));
  }, [destIds]);

  const deplacer = useMutation({
    mutationFn: () => deplacerCompte({ compteId: compte.id, destPosterId: destId }),
    onSuccess: () => {
      setOuvert(false);
      void queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });

  if (dests.length === 0) {
    const autresCreateurs = createurs.some(
      (c) => c.id !== source.id && (c.role ?? "poster") === "poster",
    );
    return (
      <p className="text-xs text-muted-foreground">
        {estCompteCm(compte) && autresCreateurs
          ? t("cm.languePrise")
          : t("hiring.deplacerCompteAucun")}
      </p>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary"
      >
        <ArrowRightLeft className="size-3" />
        {t("hiring.deplacerCompte")}
      </button>
    );
  }

  const dest = dests.find((d) => d.id === destId);
  const erreur = deplacer.error as Error | undefined;
  const messageErreur =
    erreur?.message === "DEST_PAS_CREATEUR" || erreur?.message === "forbidden"
      ? t("hiring.deplacerCompteDestPasCreateur")
      : erreur?.message === "CM_LANGUE_PRISE"
        ? t("cm.languePrise")
        : erreur?.message;

  return (
    <form
      className="space-y-2 rounded-md border p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!dest) return;
        if (
          !window.confirm(
            t("hiring.deplacerCompteConfirm", {
              compte: libelleCompte(compte),
              depuis: nomProfil(source),
              vers: nomProfil(dest),
            }),
          )
        ) {
          return;
        }
        deplacer.mutate();
      }}
    >
      <p className="text-xs font-medium">{t("hiring.deplacerCompte")}</p>
      <p className="text-[11px] text-muted-foreground">{t("hiring.deplacerCompteAide")}</p>
      <div className="space-y-1">
        <Label htmlFor={`deplacer-${compte.id}`} className="text-xs">
          {t("hiring.deplacerCompteCible")}
        </Label>
        <select
          id={`deplacer-${compte.id}`}
          className={selectClass}
          value={destId}
          onChange={(e) => setDestId(e.target.value)}
          required
        >
          {dests.map((d) => (
            <option key={d.id} value={d.id}>
              {nomProfil(d)}
              {d.email && d.email !== nomProfil(d) ? ` · ${d.email}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={deplacer.isPending || !destId}>
          <ArrowRightLeft className="size-4" />
          {deplacer.isPending ? t("common.saving") : t("hiring.deplacerCompteAction")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
          {t("common.cancel")}
        </Button>
      </div>
      {deplacer.isError && <p className="text-xs text-destructive">{messageErreur}</p>}
    </form>
  );
}

/**
 * Une ligne créateur côté HM : identité TikTok (avatar, @, nom, source, bio),
 * ÉDITABLE (nom, @, bio). Le HM a recruté ce créateur, il peut ajuster son
 * identité (RLS `comptes_update_hiring`). La source et les ratios restent côté
 * admin. L'affichage se met à jour dès qu'on enregistre (invalidation ["posters"]).
 */
function LignePoster({
  poster: p,
  createurs,
}: {
  poster: PosterProfil;
  createurs: PosterProfil[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const applications = useQuery({ queryKey: ["applications"], queryFn: listerApplications });
  const comptes = p.comptes ?? [];
  const [compteId, setCompteId] = React.useState(
    () => comptePrincipal(comptes)?.id ?? p.compte_id ?? "",
  );
  const compteActif = comptes.find((c) => c.id === compteId) ?? comptePrincipal(comptes);
  const [edite, setEdite] = React.useState(false);
  const [nom, setNom] = React.useState(compteActif?.persona_nom ?? p.persona_nom ?? "");
  const [handle, setHandle] = React.useState(compteActif?.handle_tiktok ?? p.handle_tiktok ?? "");
  const [bio, setBio] = React.useState(compteActif?.persona_bio ?? p.persona_bio ?? "");

  React.useEffect(() => {
    if (compteId && comptes.some((c) => c.id === compteId)) return;
    setCompteId(comptePrincipal(comptes)?.id ?? p.compte_id ?? "");
  }, [comptes, compteId, p.compte_id]);

  React.useEffect(() => {
    setNom(compteActif?.persona_nom ?? "");
    setHandle(compteActif?.handle_tiktok ?? "");
    setBio(compteActif?.persona_bio ?? "");
    setEdite(false);
  }, [compteActif?.id, compteActif?.persona_nom, compteActif?.handle_tiktok, compteActif?.persona_bio]);

  const enregistrer = useMutation({
    mutationFn: () =>
      majCompte(compteActif!.id, {
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
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {[p.prenom, p.nom].filter(Boolean).join(" ") || p.email}
            </span>
            {!p.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{p.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {t("posters.nbComptes", { n: comptes.length })}
          </span>
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
        </div>
      </div>

      {comptes.length === 0 ? (
        <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
          {t("posters.aucunCompte")}
        </p>
      ) : (
        <ul className="space-y-2">
          {comptes.map((c) => {
            const ouvert = compteActif?.id === c.id;
            return (
              <li
                key={c.id}
                className={
                  ouvert
                    ? "space-y-2 rounded-md border border-primary/40 bg-muted/20 p-2.5"
                    : "space-y-2 rounded-md border p-2.5"
                }
              >
                <div className="cursor-pointer" onClick={() => setCompteId(c.id)}>
                  <EnteteCompte
                    compact
                    compte={c}
                    extra={
                      !estCompteCm(c) ? (
                        <div className="mt-1">
                          <WarmupBadge
                            compteId={c.id}
                            startedAt={c.warmup_started_at}
                            endsAt={c.warmup_ends_at}
                          />
                        </div>
                      ) : undefined
                    }
                  />
                </div>
                {ouvert && edite ? (
                  <div className="space-y-2 border-t pt-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`nom-${c.id}`} className="text-xs">
                          {t("comptes.nomAffiche")}
                        </Label>
                        <Input id={`nom-${c.id}`} value={nom} onChange={(e) => setNom(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`h-${c.id}`} className="text-xs">
                          {t("comptes.pseudo")}
                        </Label>
                        <Input id={`h-${c.id}`} value={handle} onChange={(e) => setHandle(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`bio-${c.id}`} className="text-xs">
                        {t("comptes.bioProposee")}
                      </Label>
                      <textarea
                        id={`bio-${c.id}`}
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
                ) : ouvert ? (
                  <div className="space-y-2 border-t pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {c.persona_bio ||
                          (c.handle_tiktok ? "" : t("hiring.identiteEnCours"))}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEdite(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                      >
                        <Pencil className="size-3" />
                        {t("common.edit")}
                      </button>
                    </div>
                    <DeplacerCompte compte={c} source={p} createurs={createurs} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <FormulaireAjouterCompte
        posterId={p.id}
        languesProposees={langues.data ?? []}
        languesPrisesCm={languesCmPrises(comptes)}
        applications={applications.data ?? []}
      />
    </div>
  );
}

/**
 * Écran unique du hiring manager : créer un login créateur, puis le premier
 * compte TikTok (perso = identité générée, ou CM = identifiants existants).
 */
export function HiringPosterPage() {
  const { t } = useTranslation();
  const { profil } = useAuth();
  const queryClient = useQueryClient();

  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const applications = useQuery({ queryKey: ["applications"], queryFn: listerApplications });
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });
  const createurs = React.useMemo(
    () => (posters.data ?? []).filter((p) => p.role === "poster"),
    [posters.data],
  );

  const [prenom, setPrenom] = React.useState("");
  const [nom, setNom] = React.useState("");
  const [langue, setLangue] = React.useState("");
  const { slug: slugContexte } = useApplication();
  const [applicationSlug, setApplicationSlug] = React.useState(slugContexte || SLUG_SOPHIA);
  const [premierCompte, setPremierCompte] = React.useState<PremierCompte>("perso");
  const [postsParJour, setPostsParJour] = React.useState<1 | 2 | 3>(2);
  const [handleTiktok, setHandleTiktok] = React.useState("");
  const [cmEmail, setCmEmail] = React.useState("");
  const [cmPassword, setCmPassword] = React.useState("");
  const [cmDeuxFa, setCmDeuxFa] = React.useState("");
  const [cree, setCree] = React.useState<{
    email: string;
    persona: boolean;
    type: PremierCompte;
  } | null>(null);

  // Langues gérées par le recruteur : un créateur = une langue, choisie à
  // chaque embauche. Plusieurs langues gérées → créateurs de langues différentes.
  // Aucune langue posée (ex. admin) → toutes les langues cibles.
  const modeUgcAiVideo = Boolean(profil?.hm_ugc_ai_video);
  const mesLangues = (profil?.langues ?? []).filter((l) => langues.data?.includes(l));
  const languesChoix = mesLangues.length > 0 ? mesLangues : (langues.data ?? []);

  React.useEffect(() => {
    if (slugContexte) setApplicationSlug(slugContexte);
  }, [slugContexte]);

  React.useEffect(() => {
    if (!languesChoix.length) return;
    setLangue((actuel) => langueInitiale(languesChoix, actuel));
  }, [languesChoix]);

  const creer = useMutation({
    mutationFn: () =>
      creerPoster({
        prenom,
        nom,
        password: MOT_DE_PASSE,
        langue,
        application_slug: applicationSlug,
        type_compte: premierCompte,
        posts_par_jour: premierCompte === "perso" ? postsParJour : undefined,
        handle_tiktok: handleTiktok,
        tiktok_email: cmEmail,
        tiktok_password: cmPassword,
        tiktok_2fa_note: cmDeuxFa,
      }),
    onSuccess: (r) => {
      setCree({
        email: r.email,
        persona: Boolean(r.compte?.persona),
        type: premierCompte,
      });
      setPrenom("");
      setNom("");
      setPostsParJour(2);
      setHandleTiktok("");
      setCmEmail("");
      setCmPassword("");
      setCmDeuxFa("");
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
            <ChampsPremierCompte
              typeCompte={premierCompte}
              onType={setPremierCompte}
              langues={languesChoix}
              langue={langue}
              onLangue={setLangue}
              applications={applications.data ?? []}
              applicationSlug={applicationSlug}
              onApplication={setApplicationSlug}
              postsParJour={postsParJour}
              onPostsParJour={setPostsParJour}
              handle={handleTiktok}
              onHandle={setHandleTiktok}
              email={cmEmail}
              onEmail={setCmEmail}
              password={cmPassword}
              onPassword={setCmPassword}
              deuxFa={cmDeuxFa}
              onDeuxFa={setCmDeuxFa}
            />
            <div className="sm:col-span-2 space-y-3">
              <Button
                type="submit"
                disabled={
                  creer.isPending ||
                  !langue ||
                  (premierCompte === "cm" && (!cmEmail.trim() || !cmPassword))
                }
              >
                {creer.isPending ? t("hiring.enCours") : t("hiring.create")}
              </Button>
              {premierCompte === "perso" && (
                <BarreChargement
                  actif={creer.isPending}
                  dureeMs={13_000}
                  label={t("hiring.progressIdentite")}
                />
              )}
              {creer.isError && (
                <p className="mt-2 text-sm text-destructive">
                  {(creer.error as Error).message === "NO_FREE_REFERENCE"
                    ? t("posters.creationRefusee")
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
              {cree.type === "cm" ? (
                <p className="pt-1 text-xs text-muted-foreground">{t("posters.creeCm")}</p>
              ) : (
                <>
                  <p className="pt-1 text-xs text-muted-foreground">
                    {cree.persona ? t("hiring.personaOk") : t("hiring.personaPlusTard")}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("warmup.apresCreation")}</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-5">
          {posters.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {createurs.length === 0 && !posters.isPending && (
            <EmptyState title={t("posters.empty")} />
          )}
          {createurs.map((p) => (
            <LignePoster key={p.id} poster={p} createurs={createurs} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
