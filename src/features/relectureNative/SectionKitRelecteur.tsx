import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Info,
  ListOrdered,
  Loader2,
  Megaphone,
  MessageSquare,
  PenLine,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardPanel, EmptyState } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { Textarea } from "@/components/ui/textarea";
import { nomApplication } from "@/features/moteur/applications";
import { cn } from "@/lib/utils";

import {
  enregistrerEcritureKit,
  listerEcrituresKit,
  listerKit,
  presentationsApplis,
  type PresentationAppli,
  type Relecteur,
} from "./api";
import { CLASSES_TON, ETAT, VOIE } from "./apparence";
import {
  accrochePost,
  avecSlideEcrite,
  etatPostKit,
  postsDuKit,
  texteEcrit,
  toutesSlidesEcrites,
  type EcritureKit,
  type PostKit,
} from "./kit";
import { messageErreur } from "./messageErreur";
import { Puce, TuileIcone } from "./Puces";
import { useEnregistrementAuto } from "./useEnregistrementAuto";

/**
 * Partie 2 de l'espace relecteur : le kit natif. Les posts en tuiles, puis le
 * post choisi, slide par slide, à côté de l'image de la slide d'origine.
 */
export function SectionKitRelecteur({ relecteur }: { relecteur: Relecteur }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cleEcritures = ["kit-natif-mes-ecritures", relecteur.id] as const;
  const kit = useQuery({ queryKey: ["kit-natif-relecteur"], queryFn: listerKit });
  const ecritures = useQuery({ queryKey: cleEcritures, queryFn: () => listerEcrituresKit(relecteur.id) });
  const presentations = useQuery({ queryKey: ["presentations-applis-relecteur"], queryFn: presentationsApplis });
  const [choisi, setChoisi] = React.useState<string | null>(null);
  const haut = React.useRef<HTMLDivElement>(null);

  const posts = React.useMemo(() => postsDuKit(kit.data ?? []), [kit.data]);
  const parPost = React.useMemo(
    () => new Map((ecritures.data ?? []).map((e) => [e.kit_id, e])),
    [ecritures.data],
  );

  if (kit.isPending || ecritures.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const erreur = kit.error ?? ecritures.error;
  if (erreur) return <p className="text-sm text-destructive">{messageErreur(erreur)}</p>;

  const post =
    posts.find((p) => p.id === choisi) ?? posts.find((p) => etatPostKit(parPost.get(p.id)) !== "rendu") ?? posts[0];
  const index = post ? posts.indexOf(post) : -1;

  const ouvrir = (id: string) => {
    setChoisi(id);
    haut.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  // Un post qui vient d'être fini : on passe au suivant qui reste à écrire.
  // Sinon, le post enregistré reste affiché.
  const memoriser = (e: EcritureKit) => {
    const vientDeFinir = Boolean(e.rendu_at) && !parPost.get(e.kit_id)?.rendu_at;
    queryClient.setQueryData<EcritureKit[]>(cleEcritures, (avant = []) => [
      ...avant.filter((x) => x.kit_id !== e.kit_id),
      e,
    ]);
    const i = posts.findIndex((p) => p.id === e.kit_id);
    const suivant = vientDeFinir
      ? [...posts.slice(i + 1), ...posts.slice(0, i)].find((p) => etatPostKit(parPost.get(p.id)) !== "rendu")
      : undefined;
    if (suivant) ouvrir(suivant.id);
    else setChoisi(e.kit_id);
  };

  return (
    <div className="space-y-5" data-testid="kit-relecteur">
      <Card>
        <CardPanel className="space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <TuileIcone icone={PenLine} ton="violet" />
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-base font-semibold">{t("relectureNative.kit.titre")}</h2>
              <p className="text-sm text-muted-foreground">{t("relectureNative.kit.aide")}</p>
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {(
              [
                [Sparkles, "regleMotAMot"],
                [ListOrdered, "regleStructure"],
                [Globe2, "regleCulture"],
              ] as const
            ).map(([Icone, cle], i) => (
              <li
                key={cle}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-3 text-sm",
                  i === 0 ? "border-violet-500/25 bg-violet-500/8 font-semibold text-violet-800 dark:text-violet-200" : "bg-muted/30",
                )}
              >
                <Icone className={cn("mt-0.5 size-4 shrink-0", i === 0 ? "" : "text-muted-foreground")} aria-hidden />
                {t(`relectureNative.kit.${cle}`)}
              </li>
            ))}
          </ul>
        </CardPanel>
      </Card>

      {posts.length === 0 ? (
        <EmptyState title={t("relectureNative.kit.vide")} />
      ) : (
        <nav aria-label={t("relectureNative.kit.liste")}>
          <ul className="grid grid-cols-5 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(3.5rem,1fr))]">
            {posts.map((p) => {
              const etat = etatPostKit(parPost.get(p.id));
              const { icone: Icone, ton } = ETAT[etat];
              const actif = p.id === post?.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => ouvrir(p.id)}
                    aria-current={actif ? "true" : undefined}
                    aria-label={`${t("relectureNative.kit.post", { rang: p.rang })} · ${t(`relectureNative.kit.etats.${etat}`)}`}
                    title={accrochePost(p)}
                    className={cn(
                      "flex w-full flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition-colors",
                      CLASSES_TON[ton],
                      actif ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:brightness-95",
                    )}
                  >
                    <span className="text-base leading-none font-semibold tabular-nums">{p.rang}</span>
                    <Icone className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div ref={haut} className="scroll-mt-4">
        {post && (
          <EditeurPostKit
            key={post.id}
            relecteurId={relecteur.id}
            post={post}
            total={posts.length}
            ecriture={parPost.get(post.id)}
            presentation={presentations.data?.find((a) => a.application_id === post.application_id)}
            onEnregistre={memoriser}
            onPrecedent={index > 0 ? () => ouvrir(posts[index - 1].id) : undefined}
            onSuivant={index < posts.length - 1 ? () => ouvrir(posts[index + 1].id) : undefined}
          />
        )}
      </div>
    </div>
  );
}

function EditeurPostKit({
  relecteurId,
  post,
  total,
  ecriture,
  presentation,
  onEnregistre,
  onPrecedent,
  onSuivant,
}: {
  relecteurId: string;
  post: PostKit;
  total: number;
  ecriture: EcritureKit | undefined;
  presentation: PresentationAppli | undefined;
  onEnregistre: (e: EcritureKit) => void;
  onPrecedent?: () => void;
  onSuivant?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [slides, setSlides] = React.useState(ecriture?.slides ?? []);
  const [remarque, setRemarque] = React.useState(ecriture?.remarque ?? "");
  const renduAt = ecriture?.rendu_at ?? null;
  const appli = presentation
    ? nomApplication({ nom: presentation.nom, slug: presentation.slug })
    : t("relectureNative.kit.lAppli");
  const voie = VOIE[post.voie];

  const enregistrer = useMutation({
    mutationFn: (e: Pick<EcritureKit, "slides" | "remarque" | "rendu_at">) =>
      enregistrerEcritureKit(relecteurId, post.id, e),
    onSuccess: (_, e) => onEnregistre({ relecteur_id: relecteurId, kit_id: post.id, ...e }),
  });
  const sauver = (patch: Partial<Pick<EcritureKit, "slides" | "remarque" | "rendu_at">>) =>
    enregistrer.mutate({ slides, remarque, rendu_at: renduAt, ...patch });
  // Tout le post (slides et remarque) s'enregistre au fil de la frappe.
  const quitter = useEnregistrementAuto(
    empreinte(slides, remarque),
    empreinte(ecriture?.slides ?? [], ecriture?.remarque ?? ""),
    () => sauver({}),
  );

  const slidesEn = [...post.slides_en].sort((a, b) => a.position - b.position);
  const ecrites = slidesEn.filter((s) => texteEcrit(slides, s.position).trim()).length;
  const pret = toutesSlidesEcrites(slidesEn, slides);
  const slideAppli = post.voie === "libre" ? null : post.slide_cta;
  const consigneVoie =
    post.voie === "reprise" && post.slide_cta
      ? t("relectureNative.kit.voies.reprise", { appli, slide: post.slide_cta })
      : t(`relectureNative.kit.voies.${post.voie === "reprise" ? "repriseSansSlide" : post.voie}`, { appli });

  return (
    <Card data-testid={`post-kit-${post.rang}`} className="overflow-hidden">
      <div className="space-y-3 border-b bg-muted/30 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground tabular-nums">
            {post.rang}
          </span>
          <div className="min-w-0 flex-1">
            <p className={MICRO_LABEL}>{t("relectureNative.kit.postSur", { rang: post.rang, total })}</p>
            <h3 className="text-base leading-snug font-semibold">{accrochePost(post)}</h3>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!onPrecedent}
              onClick={onPrecedent}
              aria-label={t("relectureNative.kit.precedent")}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!onSuivant}
              onClick={onSuivant}
              aria-label={t("relectureNative.kit.suivant")}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:pl-13">
          {presentation && <Puce icone={Smartphone}>{appli}</Puce>}
          <Puce icone={voie.icone} ton={voie.ton}>
            {t(`relectureNative.kit.voiesCourtes.${post.voie}`)}
          </Puce>
          {renduAt && (
            <Puce icone={CheckCircle2} ton="vert">
              {t("relectureNative.kit.etats.rendu")}
            </Puce>
          )}
        </div>
      </div>

      <CardPanel className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div className={cn("space-y-2 rounded-xl border p-4 text-sm md:col-span-2", CLASSES_TON[voie.ton])}>
            <p className="flex items-center gap-2 font-semibold">
              <Megaphone className="size-4" aria-hidden />
              {t("relectureNative.kit.consigne", { appli })}
            </p>
            <p className="text-foreground">{consigneVoie}</p>
            {post.consigne_cta.trim() && <p className="whitespace-pre-wrap text-foreground">{post.consigne_cta}</p>}
          </div>
          {post.a_adapter.trim() && (
            <BlocBrief icone={Globe2} titre={t("relectureNative.kit.aAdapter")}>
              {post.a_adapter}
            </BlocBrief>
          )}
          {presentation?.presentation.trim() && (
            <BlocBrief icone={Info} titre={t("relectureNative.kit.presentation", { appli })}>
              {presentation.presentation}
            </BlocBrief>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t("relectureNative.kit.lesSlides")}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("relectureNative.kit.slidesEcrites", { n: ecrites, total: slidesEn.length })}
            </p>
          </div>
          <ol className="space-y-4">
            {slidesEn.map((s) => {
              const cta = slideAppli === s.position;
              const ecrit = texteEcrit(slides, s.position);
              const enregistre = texteEcrit(ecriture?.slides ?? [], s.position);
              const id = `kit-${post.id}-${s.position}`;
              return (
                <li
                  key={s.position}
                  className={cn(
                    "grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4 sm:p-4",
                    cta && "border-info/50 ring-1 ring-info/20",
                  )}
                  data-testid={`slide-kit-${s.position}`}
                >
                  <div className="relative sm:row-span-2">
                    {s.image_url ? (
                      <a href={s.image_url} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={s.image_url}
                          alt={t("relectureNative.kit.slide", { n: s.position })}
                          loading="lazy"
                          className="aspect-[9/16] w-full rounded-lg border bg-muted object-cover"
                        />
                      </a>
                    ) : (
                      <div className="aspect-[9/16] w-full rounded-lg border border-dashed bg-muted/40" />
                    )}
                    <span className="absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-background/90 text-xs font-semibold shadow-sm tabular-nums">
                      {s.position}
                    </span>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{t("relectureNative.kit.slide", { n: s.position })}</span>
                      {cta && (
                        <Puce icone={Megaphone} ton="bleu">
                          {t("relectureNative.kit.slideAppli", { appli })}
                        </Puce>
                      )}
                      {enregistre.trim() && (
                        <Check className="ml-auto size-4 text-success" aria-label={t("relectureNative.kit.slideEcrite")} />
                      )}
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className={MICRO_LABEL}>{t("relectureNative.kit.anglais")}</p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{s.texte}</p>
                    </div>
                  </div>
                  <div className="col-span-2 space-y-1 sm:col-span-1 sm:col-start-2">
                    <label htmlFor={id} className={cn(MICRO_LABEL, "flex items-center gap-1")}>
                      <PenLine className="size-3" aria-hidden />
                      {t("relectureNative.kit.taVersion")}
                    </label>
                    <Textarea
                      id={id}
                      dir="auto"
                      rows={Math.min(8, Math.max(2, s.texte.split("\n").length))}
                      aria-label={t("relectureNative.kit.taVersionSlide", { n: s.position })}
                      placeholder={t("relectureNative.kit.placeholder")}
                      value={ecrit}
                      onChange={(e) => setSlides((avant) => avecSlideEcrite(avant, s.position, e.target.value))}
                      onBlur={quitter}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <label className="block space-y-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
              {t("relectureNative.kit.remarque")}
            </span>
            <span className="block text-xs text-muted-foreground">{t("relectureNative.kit.remarqueAide")}</span>
            <Textarea
              dir="auto"
              rows={2}
              value={remarque}
              onChange={(e) => setRemarque(e.target.value)}
              onBlur={quitter}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <EtatSauvegarde pending={enregistrer.isPending} succes={enregistrer.isSuccess} erreur={enregistrer.error} />
            <div className="flex flex-wrap items-center gap-2">
              {renduAt ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    {t("relectureNative.kit.rendu", { date: new Date(renduAt).toLocaleDateString(i18n.language) })}
                  </span>
                  {onSuivant && (
                    <Button variant="outline" onClick={onSuivant}>
                      {t("relectureNative.kit.suivant")}
                      <ArrowRight />
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {!pret && <span className="text-xs text-muted-foreground">{t("relectureNative.kit.rendreAide")}</span>}
                  <Button disabled={!pret || enregistrer.isPending} onClick={() => sauver({ rendu_at: new Date().toISOString() })}>
                    <CheckCircle2 />
                    {t("relectureNative.kit.rendre")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}

/** Ce qui est écrit dans un post, pour savoir s'il reste quelque chose à enregistrer. */
function empreinte(slides: ReadonlyArray<{ position: number; texte: string }>, remarque: string): string {
  const triees = [...slides].sort((a, b) => a.position - b.position).map((s) => [s.position, s.texte]);
  return JSON.stringify([triees, remarque]);
}

function BlocBrief({ icone: Icone, titre, children }: { icone: LucideIcon; titre: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-xl border bg-card p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Icone className="size-4 text-muted-foreground" aria-hidden />
        {titre}
      </p>
      <p className="whitespace-pre-wrap text-muted-foreground">{children}</p>
    </div>
  );
}

function EtatSauvegarde({ pending, succes, erreur }: { pending: boolean; succes: boolean; erreur: unknown }) {
  const { t } = useTranslation();
  if (erreur) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircle className="size-3.5" aria-hidden />
        {messageErreur(erreur)}
      </span>
    );
  }
  if (pending) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {t("relectureNative.poster.enregistrement")}
      </span>
    );
  }
  if (succes) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-success-foreground">
        <Check className="size-3.5" aria-hidden />
        {t("relectureNative.poster.enregistre")}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{t("relectureNative.kit.autoSave")}</span>;
}
