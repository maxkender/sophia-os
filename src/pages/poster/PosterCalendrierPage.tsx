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
  majMonHandle,
  mesComptes,
  type MonCompte,
} from "@/features/moteur/api";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import { statutWarmup } from "@/features/moteur/warmup";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

interface PostCalendrier {
  id: string;
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
function IdentiteTikTok({ compte, index }: { compte: MonCompte; index: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
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
              {t("identite.titre")} · {t("hiring.compteN", { n: index + 1 })}
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
            <p className="pt-1 text-xs text-muted-foreground">{t("identite.aide")}</p>
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
  const startWarmup = useMutation({
    mutationFn: (compteId: string) => demarrerWarmup(compteId),
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

  // Un jour peut porter plusieurs posts : la case affiche donc une liste.
  const parJour = React.useMemo(() => {
    const carte = new Map<string, PostCalendrier[]>();
    for (const post of posts ?? []) {
      const date = post.date_publication_prevue;
      if (!date) continue;
      carte.set(date, [...(carte.get(date) ?? []), post]);
    }
    return carte;
  }, [posts]);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const duJour = parJour.get(jour) ?? [];
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

  const comptesListe = comptes ?? [];
  const aDemarrer = comptesListe.filter(
    (c) =>
      statutWarmup({
        warmup_started_at: c.warmup_started_at,
        warmup_ends_at: c.warmup_ends_at,
      }) === "attente",
  );
  const warmupStatut = aDemarrer.length > 0 ? "attente" : comptesListe.length > 0 ? "termine" : null;

  return (
    <div className="space-y-8">
      {comptesListe.length > 0 && (
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
          <div className="flex flex-wrap items-center gap-2">
            {comptesListe.map((c, i) => (
              <span key={c.id} className="inline-flex items-center gap-1.5">
                {comptesListe.length > 1 && (
                  <span className="text-[10px] text-muted-foreground">
                    {t("hiring.compteN", { n: i + 1 })}
                  </span>
                )}
                <WarmupBadge
                  compteId={c.id}
                  startedAt={c.warmup_started_at}
                  endsAt={c.warmup_ends_at}
                  showStart={
                    statutWarmup({
                      warmup_started_at: c.warmup_started_at,
                      warmup_ends_at: c.warmup_ends_at,
                    }) === "attente"
                  }
                  startPending={startWarmup.isPending}
                  onStart={() => startWarmup.mutate(c.id)}
                />
              </span>
            ))}
            {startWarmup.isError && (
              <span className="text-xs text-destructive">
                {(startWarmup.error as Error).message}
              </span>
            )}
          </div>
        </div>
      )}

      {comptesListe.map((c, i) => (
        <IdentiteTikTok key={c.id} compte={c} index={i} />
      ))}

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
        <h2 className="text-lg font-semibold tracking-tight">{t("calendrier.aujourdhui")}</h2>
        {duJour.length === 0 ? (
          <EmptyState icon={<CalendarCheck className="size-5" />} title={t("calendrier.rien")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {duJour.map((post, index) => (
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

                  {duJourCase.map((post) => (
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

        <p className="text-xs text-muted-foreground">{t("calendrier.legende")}</p>
      </section>
    </div>
  );
}
