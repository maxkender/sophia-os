import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Gift,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, EmptyState } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import {
  aujourdhui,
  demarrerWarmup,
  lireCohorteAccueil,
  majMonHandle,
  majMonHandleInstagram,
  mesComptes,
  type MonCompte,
} from "@/features/moteur/api";
import { CinqEtapes } from "@/features/onboarding/CinqEtapes";
import { BandeauCohorteRuul, FriseCohorteRuul } from "@/features/onboarding/CohorteRuulCalendrier";
import { ajouterJours, formaterJour, partiesParis, premierPaiementRuul } from "@/features/onboarding/datesRuul";
import { CarteCommentPaye } from "@/features/regles/CartesRegles";
import { arriveePosts, estManque, heureArriveeAnnoncee } from "@/features/moteur/echeancePublication";
import { debutParDefaut, joursFenetre, libelleFenetre, lundiDe } from "@/features/moteur/semaines";
import {
  comptePrincipal,
  ecrireCompteActif,
  estCompteCm,
  lireCompteActif,
} from "@/features/moteur/comptesCm";
import { drapeauLangue } from "@/features/moteur/langues";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import { BandeauRecreation } from "@/features/ckd/recreation/BandeauRecreation";
import { VideosAPoster } from "@/features/pods/VideosAPoster";
import { statutWarmup } from "@/features/moteur/warmup";
import { calendrierWarmup, lundiApres, premierJourPosts } from "@/features/moteur/premiersPosts";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

interface PostCalendrier {
  id: string;
  compte_id: string | null;
  date_publication_prevue: string | null;
  type: string;
  statut: string;
  persona_nom: string | null;
  handle_tiktok: string | null;
  sujet_titre: string | null;
  publie_at: string | null;
}

/** Lit la vue `posts_poster`, qui ne révèle jamais le compte de référence. */
async function mesPosts(): Promise<PostCalendrier[]> {
  const { data, error } = await supabase
    .from("posts_poster")
    .select("*")
    .order("date_publication_prevue", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw error;
  return data as PostCalendrier[];
}

function CartePost({ post, creneau }: { post: PostCalendrier; creneau?: number }) {
  const { t } = useTranslation();
  const publie = Boolean(post.publie_at);

  return (
    <Card className={publie ? "opacity-70" : "border-primary/30 shadow-lifted"}>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold leading-snug">
              {post.sujet_titre ?? t("posts.title")}
            </p>
            {publie && <CheckCircle2 className="size-5 shrink-0 text-success" />}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {creneau && <Badge variant="outline">{t("calendrier.creneau", { n: creneau })}</Badge>}
            <Badge variant="secondary">{t(`type.${post.type}`)}</Badge>
            {post.handle_tiktok && <Badge variant="outline">@{post.handle_tiktok}</Badge>}
          </div>
        </div>

        <Button asChild size="lg" className="w-full" variant={publie ? "outline" : "default"}>
          <Link to={`/posts/${post.id}`}>
            {t("calendrier.voirPost")}
            <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Carte « Ton identité TikTok » : le pseudo, la bio et l'avatar générés
 * automatiquement à la création du compte, que le poster recopie pour monter son
 * vrai compte TikTok. Rien à créer ici — juste à afficher ce qui existe déjà.
 */
function SelecteurCompte({
  comptes,
  actifId,
  onChange,
}: {
  comptes: MonCompte[];
  actifId: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (comptes.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t("cm.selecteur")}</span>
      {comptes.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={
            c.id === actifId
              ? "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
              : "rounded-md border px-2.5 py-1 text-xs"
          }
        >
          {estCompteCm(c) ? t("cm.badge") : t("cm.perso")} · {drapeauLangue(c.langue)}
          {c.handle_tiktok ? ` @${c.handle_tiktok}` : ""}
        </button>
      ))}
    </div>
  );
}

/** Un @ éditable par le poster (TikTok, ou Instagram pour les comptes du pod 3). */
function ChampHandle({
  valeur,
  plateforme,
  enregistrer,
}: {
  valeur: string | null;
  plateforme?: string;
  enregistrer: (handle: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [editHandle, setEditHandle] = React.useState(false);
  const [handle, setHandle] = React.useState("");

  const majHandle = useMutation({
    mutationFn: () => enregistrer(handle),
    onSuccess: () => {
      setEditHandle(false);
      queryClient.invalidateQueries({ queryKey: ["mes-comptes"] });
    },
  });

  return editHandle ? (
    <div className="flex items-center gap-1">
      <span className="text-sm text-muted-foreground">{plateforme ? `${plateforme} @` : "@"}</span>
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder={valeur ?? "ton.pseudo"}
        className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-sm"
      />
      <Button size="sm" className="h-7" disabled={majHandle.isPending} onClick={() => majHandle.mutate()}>
        {t("common.save")}
      </Button>
      <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditHandle(false)}>
        {t("common.cancel")}
      </Button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-muted-foreground">
        {plateforme ? `${plateforme} ` : ""}@{valeur ?? "—"}
      </p>
      <button
        type="button"
        onClick={() => {
          setHandle(valeur ?? "");
          setEditHandle(true);
        }}
        className="text-xs text-primary underline underline-offset-2"
      >
        {valeur ? t("identite.majHandle") : t("identite.setHandle")}
      </button>
    </div>
  );
}

function IdentiteTikTok({ compte }: { compte: MonCompte }) {
  const { t } = useTranslation();

  const copier = (texte: string) => navigator.clipboard?.writeText(texte);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {compte.avatar_url && (
            <img
              src={compte.avatar_url}
              alt=""
              className="size-16 shrink-0 rounded-full border object-cover"
            />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {compte.videos_uniquement ? t("identite.titreUgc") : t("identite.titre")}
            </p>
            {compte.persona_nom && <p className="text-sm font-semibold">{compte.persona_nom}</p>}

            {/* Le @ TikTok : éditable par le poster une fois son compte créé. */}
            <ChampHandle valeur={compte.handle_tiktok} enregistrer={(h) => majMonHandle(h, compte.id)} />
            {/* Compte du pod 3 : il publie aussi sur Instagram. */}
            {compte.videos_uniquement && (
              <ChampHandle
                valeur={compte.handle_instagram}
                plateforme={t("identite.instagram")}
                enregistrer={(h) => majMonHandleInstagram(h, compte.id)}
              />
            )}
            <p className="text-[11px] text-muted-foreground">{t("identite.handleAide")}</p>

            {compte.persona_bio && (
              <p className="whitespace-pre-wrap pt-1 text-sm">{compte.persona_bio}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {compte.avatar_url && (
                <Button asChild size="sm" variant="outline">
                  <a href={compte.avatar_url} download target="_blank" rel="noreferrer">
                    <Download className="size-3.5" />
                    {t("identite.avatar")}
                  </a>
                </Button>
              )}
              {compte.persona_bio && (
                <Button size="sm" variant="outline" onClick={() => copier(compte.persona_bio!)}>
                  <Copy className="size-3.5" />
                  {t("identite.copierBio")}
                </Button>
              )}
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              {compte.videos_uniquement ? t("identite.aideUgc") : t("identite.aide")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PosterCalendrierPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: posts, isPending } = useQuery({
    queryKey: ["mes-posts", user?.id],
    queryFn: mesPosts,
    enabled: Boolean(user?.id),
  });
  const { data: comptes } = useQuery({
    queryKey: ["mes-comptes"],
    queryFn: mesComptes,
    enabled: Boolean(user?.id),
  });
  const [compteId, setCompteId] = React.useState<string | null>(null);
  const compte =
    (comptes ?? []).find((c) => c.id === compteId) ?? comptePrincipal(comptes ?? []);
  const estCm = compte ? estCompteCm(compte) : false;
  // Compte UGC vidéo (pod 3) : une vidéo par jour, aucun slideshow à afficher.
  const ugc = Boolean(compte?.videos_uniquement);
  // Cohorte Ruul (venus du site) : leurs dates en clair, et Slack toujours à portée.
  const cohorte = useQuery({
    queryKey: ["accueil-cohorte"],
    queryFn: lireCohorteAccueil,
    enabled: Boolean(user?.id),
    staleTime: Infinity,
  });
  const debutRuul = cohorte.data?.cohorteRuul ? (cohorte.data.debutLe ?? null) : null;

  React.useEffect(() => {
    if (!user?.id || !comptes?.length) return;
    const sauve = lireCompteActif(user.id, comptes);
    const id = sauve ?? comptePrincipal(comptes)?.id ?? null;
    setCompteId(id);
  }, [user?.id, comptes]);

  const choisirCompte = (id: string) => {
    setCompteId(id);
    if (user?.id) ecrireCompteActif(user.id, id);
  };

  const startWarmup = useMutation({
    mutationFn: () => demarrerWarmup(compte!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mes-comptes"] });
    },
  });

  const jour = aujourdhui();
  const maintenant = new Date();
  // Fenêtre de 2 semaines (change 1), décalable semaine par semaine.
  const [decalageSemaines, setDecalageSemaines] = React.useState(0);

  // Un jour peut porter plusieurs posts : la case affiche donc une liste.
  const parJour = React.useMemo(() => {
    const carte = new Map<string, PostCalendrier[]>();
    for (const post of posts ?? []) {
      if (compte?.id && post.compte_id && post.compte_id !== compte.id) continue;
      const date = post.date_publication_prevue;
      if (!date) continue;
      carte.set(date, [...(carte.get(date) ?? []), post]);
    }
    return carte;
  }, [posts, compte?.id]);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const duJour = parJour.get(jour) ?? [];
  const titreJour = t("calendrier.aujourdhui");
  // En avance sur Paris (Nouvelle-Zélande…), les posts du jour arrivent en
  // pleine journée : on annonce l'heure plutôt que « rien de prévu » le matin.
  const heureArrivee = heureArriveeAnnoncee(jour);
  const postsAVenir = duJour.length === 0 && heureArrivee !== null && maintenant < arriveePosts(jour);

  // Noms de jours tirés de la locale plutôt que codés en dur : une bascule en
  // anglais ne doit pas laisser « lun mar mer » dans la grille.
  const enTetes = Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, index + 1).toLocaleDateString(localeDate(i18n.language), { weekday: "short" }),
  );

  const warmupStatut = compte
    ? statutWarmup({
        warmup_started_at: compte.warmup_started_at,
        warmup_ends_at: compte.warmup_ends_at,
      })
    : null;

  // Warm-up jusqu'au lundi qui suit le clic (0301), cohorte Ruul comprise (au
  // plus tôt leur lundi de démarrage). Le bandeau dit quand arrivent les
  // premiers posts, le calendrier couvre les jours de warm-up et marque la case
  // « FIRST POSTS ».
  const warmupLundi = Boolean(compte && !estCm);
  const lundiApresAujourdhui = lundiApres(new Date());
  const lundiSiLanceAujourdhui =
    debutRuul && debutRuul > lundiApresAujourdhui ? debutRuul : lundiApresAujourdhui;
  const premiersPostsLe =
    warmupLundi && warmupStatut === "en_cours" && compte?.warmup_ends_at
      ? premierJourPosts(compte.warmup_ends_at)
      : null;
  const casesWarmup =
    warmupLundi && !ugc && compte
      ? calendrierWarmup({
          warmupStartedAt: compte.warmup_started_at,
          warmupEndsAt: compte.warmup_ends_at,
        })
      : null;
  const bandeauOrange = warmupStatut === "attente" || Boolean(premiersPostsLe);

  // Hors cohorte Ruul (posters Upwork) : la même frise, payée par le HM sur
  // Upwork. Pas de lundi fixé d'avance : celui qui suit la fin du warm-up, ou,
  // pas encore lancé, celui qu'un clic aujourd'hui donnerait. Attendre la
  // réponse de la cohorte, sinon un poster Ruul verrait d'abord la version
  // Upwork. Une fois le premier paiement passé, la frise disparaît seule.
  const debutUpwork =
    cohorte.isSuccess && !debutRuul && compte && !estCm && !ugc
      ? compte.warmup_started_at && compte.warmup_ends_at
        ? premierJourPosts(compte.warmup_ends_at)
        : lundiApresAujourdhui
      : null;
  const debutFrise = debutRuul ?? debutUpwork;

  // Deux semaines : la passée et celle en cours. En warm-up, si la case
  // « FIRST POSTS » tombe après, on montre plutôt celle en cours et la suivante.
  const debutHabituel = debutParDefaut(maintenant);
  const debutDefaut =
    casesWarmup && casesWarmup.premiersPosts > ajouterJours(debutHabituel, 13)
      ? lundiDe(partiesParis(maintenant).date)
      : debutHabituel;
  const jours = joursFenetre(ajouterJours(debutDefaut, 7 * decalageSemaines));
  const paysParCompte = new Map((comptes ?? []).map((c) => [c.id, c.pays]));

  return (
    <div className="space-y-8">
      {/* Compte recréé (0368) : quoi faire, en haut de son espace. */}
      <BandeauRecreation actif={Boolean(user?.id)} />
      {comptes && comptes.length > 0 && (
        <SelecteurCompte
          comptes={comptes}
          actifId={compte?.id ?? ""}
          onChange={choisirCompte}
        />
      )}

      {/* Cohorte Ruul : sa première semaine en quatre étapes datées, juste au-dessus du bouton. */}
      {debutRuul && compte && !estCm && !ugc && (
        <FriseCohorteRuul
          debutLe={debutRuul}
          warmupStartedAt={compte.warmup_started_at}
          warmupEndsAt={compte.warmup_ends_at}
          paiePar="ruul"
        />
      )}
      {/* Les autres : les 5 étapes du chantier du 28 oct. (partie G). */}
      {debutUpwork && compte && (
        <CinqEtapes
          handle={compte.handle_tiktok}
          warmupStartedAt={compte.warmup_started_at}
          warmupEndsAt={compte.warmup_ends_at}
        />
      )}

      {/* Warmup : le créateur démarre le timer ici (plus côté HM). Pas pour les CM. */}
      {compte && !estCm && (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
          bandeauOrange
            ? "border-warning/50 bg-warning/10"
            : "border-destructive/40 bg-destructive/10",
        )}
      >
        <div className="space-y-1">
          <p
            className={cn(
              "text-sm font-medium",
              bandeauOrange ? "text-warning" : "text-destructive",
            )}
          >
            {warmupStatut === "attente"
              ? t("calendrier.warmupADemarrer")
              : premiersPostsLe
                ? t(ugc ? "calendrier.warmupEnCoursUgc" : "calendrier.warmupEnCours", {
                    jour: formaterJour(premiersPostsLe, i18n.language),
                  })
                : t("calendrier.warmupRappel")}
          </p>
          {warmupStatut === "attente" && !(debutFrise && !ugc) && (
            <p className="text-xs text-muted-foreground">
              {t(ugc ? "calendrier.warmupADemarrerAideUgc" : "calendrier.warmupADemarrerAide", {
                lundi: formaterJour(lundiSiLanceAujourdhui, i18n.language),
              })}
            </p>
          )}
          {premiersPostsLe && (
            <p className="text-xs text-muted-foreground">{t("calendrier.warmupEnCoursAide")}</p>
          )}
        </div>
        {compte && (
          <div className="flex flex-wrap items-center gap-2">
            <WarmupBadge
              compteId={compte.id}
              startedAt={compte.warmup_started_at}
              endsAt={compte.warmup_ends_at}
              showStart={warmupStatut === "attente"}
              startPending={startWarmup.isPending}
              onStart={() => startWarmup.mutate()}
              libelle={warmupLundi ? `🔥 ${t("calendrier.caseWarmup")}` : undefined}
            />
            {startWarmup.isError && (
              <span className="text-xs text-destructive">
                {(startWarmup.error as Error).message}
              </span>
            )}
          </div>
        )}
      </div>
      )}

      {debutRuul && <BandeauCohorteRuul />}

      {compte && <IdentiteTikTok compte={compte} />}

      {/* Chantier du 28 oct. : comment il est payé et la règle du lien (pas la cohorte Ruul). */}
      {cohorte.isSuccess && !debutRuul && !estCm && <CarteCommentPaye />}

      {compte && (
        <VideosAPoster
          compteId={compte.id}
          handleTiktok={compte.handle_tiktok}
          handleInstagram={compte.handle_instagram}
          vide={ugc ? t("videosPod.vide") : undefined}
        />
      )}

      <Link
        to="/createur/parrainage"
        className="block rounded-lg border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Gift className="size-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold">{t("referral.dashTitre")}</p>
            <p className="text-sm text-muted-foreground">{t("referral.dashCorps")}</p>
            <p className="text-xs font-medium text-primary">{t("referral.dashLien")}</p>
          </div>
        </div>
      </Link>

      {!ugc && (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{titreJour}</h2>
        {duJour.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="size-5" />}
            title={
              postsAVenir && warmupStatut === "termine"
                ? t("calendrier.arriveeVers", { heure: heureArrivee })
                : t("calendrier.rien")
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {duJour.map((post, index) => (
              <CartePost key={post.id} post={post} creneau={index + 1} />
            ))}
          </div>
        )}
      </section>
      )}

      {!ugc && (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{libelleFenetre(jours, i18n.language)}</h2>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("calendrier.semainePrecedente")}
              onClick={() => setDecalageSemaines((d) => d - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDecalageSemaines(0)}>
              {t("calendrier.revenirAujourdhui")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("calendrier.semaineSuivante")}
              onClick={() => setDecalageSemaines((d) => d + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {enTetes.map((nom) => (
              <div
                key={nom}
                className="p-2 text-center text-xs font-medium uppercase text-muted-foreground"
              >
                {nom}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {jours.map((date) => {
              const duJourCase = parJour.get(date) ?? [];
              const estAujourdhui = date === jour;

              return (
                <div
                  key={date}
                  className={cn(
                    // min-w-0 : sans lui, une pastille au texte long force la
                    // colonne à s'élargir et fait déborder toute la grille.
                    "min-h-20 min-w-0 space-y-1 border-b border-r p-1.5",
                    estAujourdhui && "bg-primary/5",
                    casesWarmup?.joursWarmup.has(date) && "bg-warning/10",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs",
                      estAujourdhui
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {Number(date.slice(8, 10))}
                  </span>

                  {/* Cohorte Ruul : leur lundi prévu, tant que le warm-up ne pose pas ses propres cases. */}
                  {debutRuul && !casesWarmup && date === debutRuul && (
                    <p className="w-full max-w-full truncate rounded bg-warning/20 px-1.5 py-1 font-medium text-[11px] leading-tight">
                      🚀 {t("calendrier.ruul.premierPost")}
                    </p>
                  )}
                  {debutRuul && date === premierPaiementRuul(debutRuul) && (
                    <p className="w-full max-w-full truncate rounded bg-success/15 px-1.5 py-1 font-medium text-[11px] text-success leading-tight">
                      💰 {t("calendrier.ruul.premierPaiementCase")}
                    </p>
                  )}

                  {casesWarmup?.joursWarmup.has(date) && (
                    // Téléphone : la case teintée et 🔥 suffisent, le mot ne tiendrait pas.
                    <p className="w-full max-w-full truncate rounded bg-warning/20 px-1.5 py-1 font-medium text-[11px] leading-tight">
                      🔥<span className="hidden sm:inline"> {t("calendrier.caseWarmup")}</span>
                    </p>
                  )}
                  {casesWarmup?.premiersPosts === date && (
                    // Passe à la ligne plutôt que d'être tronquée : c'est LA case à lire.
                    <p className="w-full max-w-full break-words rounded bg-primary px-1.5 py-1 font-semibold text-[11px] text-primary-foreground leading-tight">
                      🚀 {t("calendrier.casePremiersPosts")}
                    </p>
                  )}

                  {duJourCase.map((post) => {
                    // Non marqué publié avant la fin de sa journée (heure locale) : manqué.
                    const manque = estManque(post, paysParCompte.get(post.compte_id ?? "") ?? null, maintenant);
                    return (
                      <Link
                        key={post.id}
                        to={`/posts/${post.id}`}
                        title={post.sujet_titre ?? undefined}
                        className={cn(
                          "block w-full max-w-full truncate rounded px-1.5 py-1 text-[11px] leading-tight transition-colors",
                          post.publie_at
                            ? "bg-success/15 text-success hover:bg-success/25"
                            : manque
                              ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                              : "bg-primary/15 text-primary hover:bg-primary/25",
                        )}
                      >
                        {post.publie_at ? "✓ " : manque ? "✗ " : ""}
                        {post.sujet_titre ?? t("posts.title")}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{t("calendrier.legende")}</p>
        {casesWarmup && (
          <p className="text-xs text-muted-foreground">
            {heureArriveeAnnoncee(casesWarmup.premiersPosts)
              ? t("calendrier.legendeWarmupHeure", { heure: heureArriveeAnnoncee(casesWarmup.premiersPosts) })
              : t("calendrier.legendeWarmup")}
          </p>
        )}
      </section>
      )}
    </div>
  );
}
