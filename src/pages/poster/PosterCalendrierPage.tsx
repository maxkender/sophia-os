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
  FileSignature,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, EmptyState } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import {
  aujourdhui,
  demarrerWarmup,
  listerContratsPapier,
  majMonHandle,
  mesComptes,
  mesPapierPosts,
  type MonCompte,
  type PapierPost,
} from "@/features/moteur/api";
import {
  comptePrincipal,
  ecrireCompteActif,
  estCompteCm,
  lireCompteActif,
} from "@/features/moteur/comptesCm";
import { IdentifiantsCm } from "@/features/moteur/FormulaireCompteCm";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { contratPapierEnAttente } from "@/features/moteur/papierCmCompte";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import { statutWarmup } from "@/features/moteur/warmup";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

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

/** `YYYY-MM-DD` local, sans passer par l'UTC qui décalerait d'un jour. */
function isoDuJour(annee: number, mois: number, jour: number): string {
  return `${annee}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

/**
 * Grille du mois, lundi en première colonne.
 *
 * `getDay()` compte à partir de dimanche : on décale pour coller à la semaine
 * française, sinon tout le mois glisse d'un cran.
 */
function grilleDuMois(annee: number, mois: number) {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7;
  const joursDansLeMois = new Date(annee, mois + 1, 0).getDate();

  const cases: Array<number | null> = Array.from({ length: decalage }, () => null);
  for (let jour = 1; jour <= joursDansLeMois; jour += 1) cases.push(jour);
  while (cases.length % 7 !== 0) cases.push(null);

  return cases;
}

async function telechargerVideo(url: string, nom: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("download");
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = nom;
    a.click();
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function CartePapier({ post }: { post: PapierPost }) {
  const { t } = useTranslation();
  const [copie, setCopie] = React.useState<string | null>(null);
  const [dl, setDl] = React.useState(false);

  const copier = async (texte: string, cle: string) => {
    await navigator.clipboard?.writeText(texte);
    setCopie(cle);
    window.setTimeout(() => setCopie(null), 1500);
  };

  return (
    <Card className="border-primary/30 shadow-lifted">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex-1 space-y-2">
          <p className="font-semibold leading-snug">{post.title ?? t("cm.videoDuJour")}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{t("cm.badge")}</Badge>
            <Badge variant="outline">{post.langue.toUpperCase()}</Badge>
          </div>
          {post.caption ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{post.caption}</p>
          ) : null}
          {post.hashtags ? <p className="text-xs text-muted-foreground">{post.hashtags}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            disabled={dl}
            onClick={() => {
              setDl(true);
              void telechargerVideo(
                post.video_url,
                `papier-${post.date_publication_prevue}-${post.langue}.mp4`,
              ).finally(() => setDl(false));
            }}
          >
            <Download />
            {t("cm.telecharger")}
          </Button>
          {post.caption ? (
            <Button size="sm" variant="outline" onClick={() => void copier(post.caption!, "caption")}>
              <Copy className="size-3.5" />
              {copie === "caption" ? t("cm.copieOk") : t("cm.copierCaption")}
            </Button>
          ) : null}
          {post.hashtags ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copier(post.hashtags!, "tags")}
            >
              <Copy className="size-3.5" />
              {copie === "tags" ? t("cm.copieOk") : t("cm.copierHashtags")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
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

function IdentiteTikTok({ compte }: { compte: MonCompte }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cm = estCompteCm(compte);

  const [editHandle, setEditHandle] = React.useState(false);
  const [handle, setHandle] = React.useState("");

  const majHandle = useMutation({
    mutationFn: () => majMonHandle(handle, compte.id),
    onSuccess: () => {
      setEditHandle(false);
      queryClient.invalidateQueries({ queryKey: ["mes-comptes"] });
    },
  });


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
              {cm ? `${t("cm.badge")} · ${nomLangue(compte.langue)}` : t("identite.titre")}
            </p>
            {compte.persona_nom && <p className="text-sm font-semibold">{compte.persona_nom}</p>}

            {/* Le @ TikTok : éditable par le poster une fois son compte créé. */}
            {editHandle ? (
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">@</span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder={compte.handle_tiktok ?? "ton.pseudo"}
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
                  @{compte.handle_tiktok ?? "—"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHandle(compte.handle_tiktok ?? "");
                    setEditHandle(true);
                  }}
                  className="text-xs text-primary underline underline-offset-2"
                >
                  {compte.handle_tiktok ? t("identite.majHandle") : t("identite.setHandle")}
                </button>
              </div>
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
              {cm ? t("cm.aideCreateur") : t("identite.aide")}
            </p>
            {cm && (
              <div className="pt-2">
                <IdentifiantsCm compteId={compte.id} editable={false} />
              </div>
            )}
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
  const { data: papiers, isPending: papierPending } = useQuery({
    queryKey: ["mes-papier-posts", compte?.id],
    queryFn: () => mesPapierPosts(compte!.id),
    enabled: Boolean(user?.id && compte?.id && estCm),
  });
  const { data: contratsPapier } = useQuery({
    queryKey: ["papier-cm-contrats"],
    queryFn: () => listerContratsPapier(),
    enabled: Boolean(user?.id),
  });
  const contratASigner = (contratsPapier ?? []).find((c) => contratPapierEnAttente(c.statut));

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
  const [mois, setMois] = React.useState(() => ({
    annee: maintenant.getFullYear(),
    mois: maintenant.getMonth(),
  }));
  const [jourSelectionne, setJourSelectionne] = React.useState(jour);

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

  const parJourPapier = React.useMemo(() => {
    const carte = new Map<string, PapierPost[]>();
    for (const post of papiers ?? []) {
      carte.set(post.date_publication_prevue, [
        ...(carte.get(post.date_publication_prevue) ?? []),
        post,
      ]);
    }
    return carte;
  }, [papiers]);

  if (isPending || (estCm && papierPending)) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const duJour = estCm
    ? (parJourPapier.get(jourSelectionne) ?? [])
    : (parJour.get(jour) ?? []);
  const titreJour =
    estCm && jourSelectionne !== jour
      ? t("cm.jourSelectionne", { date: jourSelectionne })
      : t("calendrier.aujourdhui");
  const cases = grilleDuMois(mois.annee, mois.mois);
  const nomDuMois = new Date(mois.annee, mois.mois, 1).toLocaleDateString(i18n.language, {
    month: "long",
    year: "numeric",
  });

  const decaler = (pas: number) =>
    setMois((actuel) => {
      const date = new Date(actuel.annee, actuel.mois + pas, 1);
      return { annee: date.getFullYear(), mois: date.getMonth() };
    });

  // Noms de jours tirés de la locale plutôt que codés en dur : une bascule en
  // anglais ne doit pas laisser « lun mar mer » dans la grille.
  const enTetes = Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, index + 1).toLocaleDateString(i18n.language, { weekday: "short" }),
  );

  const warmupStatut = compte
    ? statutWarmup({
        warmup_started_at: compte.warmup_started_at,
        warmup_ends_at: compte.warmup_ends_at,
      })
    : null;

  return (
    <div className="space-y-8">
      {contratASigner ? (
        <Link
          to="/createur/contrat-papier"
          className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 hover:bg-primary/10"
        >
          <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t("papierContrat.banner")}</p>
            <p className="text-xs font-medium text-primary">{t("papierContrat.bannerCta")}</p>
          </div>
        </Link>
      ) : null}

      {comptes && comptes.length > 0 && (
        <SelecteurCompte
          comptes={comptes}
          actifId={compte?.id ?? ""}
          onChange={choisirCompte}
        />
      )}

      {/* Warmup : le créateur démarre le timer ici (plus côté HM). Pas pour les CM. */}
      {compte && !estCm && (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
          warmupStatut === "attente"
            ? "border-warning/50 bg-warning/10"
            : "border-destructive/40 bg-destructive/10",
        )}
      >
        <div className="space-y-1">
          <p
            className={cn(
              "text-sm font-medium",
              warmupStatut === "attente" ? "text-warning" : "text-destructive",
            )}
          >
            {warmupStatut === "attente"
              ? t("calendrier.warmupADemarrer")
              : t("calendrier.warmupRappel")}
          </p>
          {warmupStatut === "attente" && (
            <p className="text-xs text-muted-foreground">{t("calendrier.warmupADemarrerAide")}</p>
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

      {compte && <IdentiteTikTok compte={compte} />}

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

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">{titreJour}</h2>
        {duJour.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="size-5" />}
            title={estCm ? t("cm.videoPlusTard") : t("calendrier.rien")}
          />
        ) : estCm ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {(duJour as PapierPost[]).map((post) => (
              <CartePapier key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(duJour as PostCalendrier[]).map((post, index) => (
              <CartePost key={post.id} post={post} creneau={index + 1} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold capitalize tracking-tight">{nomDuMois}</h2>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("calendrier.moisPrecedent")}
              onClick={() => decaler(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setMois({ annee: maintenant.getFullYear(), mois: maintenant.getMonth() })
              }
            >
              {t("calendrier.revenirAujourdhui")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("calendrier.moisSuivant")}
              onClick={() => decaler(1)}
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
            {cases.map((numero, index) => {
              if (numero === null) {
                return <div key={`vide-${index}`} className="min-h-20 border-b border-r bg-muted/20" />;
              }

              const date = isoDuJour(mois.annee, mois.mois, numero);
              const duJourCase = estCm
                ? (parJourPapier.get(date) ?? [])
                : (parJour.get(date) ?? []);
              const estAujourdhui = date === jour;
              const estSelectionne = estCm && date === jourSelectionne;

              return (
                <div
                  key={date}
                  role={estCm ? "button" : undefined}
                  tabIndex={estCm ? 0 : undefined}
                  onClick={estCm ? () => setJourSelectionne(date) : undefined}
                  onKeyDown={
                    estCm
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setJourSelectionne(date);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    // min-w-0 : sans lui, une pastille au texte long force la
                    // colonne à s'élargir et fait déborder toute la grille.
                    "min-h-20 min-w-0 space-y-1 border-b border-r p-1.5",
                    estAujourdhui && "bg-primary/5",
                    estSelectionne && "ring-1 ring-inset ring-primary/40",
                    estCm && "cursor-pointer",
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
                    {numero}
                  </span>

                  {estCm
                    ? (duJourCase as PapierPost[]).map((post) => (
                        <span
                          key={post.id}
                          title={post.title ?? undefined}
                          className="block w-full max-w-full truncate rounded bg-primary/15 px-1.5 py-1 text-[11px] leading-tight text-primary"
                        >
                          {post.title ?? t("cm.videoDuJour")}
                        </span>
                      ))
                    : (duJourCase as PostCalendrier[]).map((post) => (
                        <Link
                          key={post.id}
                          to={`/posts/${post.id}`}
                          title={post.sujet_titre ?? undefined}
                          className={cn(
                            "block w-full max-w-full truncate rounded px-1.5 py-1 text-[11px] leading-tight transition-colors",
                            post.publie_at
                              ? "bg-success/15 text-success hover:bg-success/25"
                              : "bg-primary/15 text-primary hover:bg-primary/25",
                          )}
                        >
                          {post.publie_at ? "✓ " : ""}
                          {post.sujet_titre ?? t("posts.title")}
                        </Link>
                      ))}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {estCm ? t("cm.calendrierLegende") : t("calendrier.legende")}
        </p>
      </section>
    </div>
  );
}
