import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle, EmptyState } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import {
  accrochePost,
  avancementKit,
  avecSlideEcrite,
  etatPostKit,
  postsDuRelecteur,
  TAILLE_TEST_KIT,
  texteEcrit,
  toutesSlidesEcrites,
  type EcritureKit,
  type EtatPostKit,
  type PostKit,
} from "./kit";
import { messageErreur } from "./messageErreur";

const VARIANTE_ETAT: Record<EtatPostKit, "secondary" | "warning" | "success"> = {
  a_faire: "secondary",
  en_cours: "warning",
  rendu: "success",
};

/**
 * Partie 2 de l'espace relecteur : le kit natif. Chaque post s'écrit slide par
 * slide, à côté de l'image de la slide d'origine.
 */
export function SectionKitRelecteur({ relecteur }: { relecteur: Relecteur }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cleEcritures = ["kit-natif-mes-ecritures", relecteur.id] as const;
  const kit = useQuery({ queryKey: ["kit-natif-relecteur"], queryFn: listerKit });
  const ecritures = useQuery({ queryKey: cleEcritures, queryFn: () => listerEcrituresKit(relecteur.id) });
  const presentations = useQuery({ queryKey: ["presentations-applis-relecteur"], queryFn: presentationsApplis });
  const [choisi, setChoisi] = React.useState<string | null>(null);

  const posts = React.useMemo(() => postsDuRelecteur(kit.data ?? [], relecteur.statut), [kit.data, relecteur.statut]);
  const parPost = React.useMemo(
    () => new Map((ecritures.data ?? []).map((e) => [e.kit_id, e])),
    [ecritures.data],
  );

  if (kit.isPending || ecritures.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const erreur = kit.error ?? ecritures.error;
  if (erreur) return <p className="text-sm text-destructive">{messageErreur(erreur)}</p>;

  const avancement = avancementKit(posts, ecritures.data ?? []);
  const post =
    posts.find((p) => p.id === choisi) ?? posts.find((p) => etatPostKit(parPost.get(p.id)) !== "rendu") ?? posts[0];
  const suivant = post ? posts[posts.indexOf(post) + 1] : undefined;

  // Le post qu'on vient d'enregistrer reste affiché, même une fois rendu.
  const memoriser = (e: EcritureKit) => {
    setChoisi(e.kit_id);
    queryClient.setQueryData<EcritureKit[]>(cleEcritures, (avant = []) => [
      ...avant.filter((x) => x.kit_id !== e.kit_id),
      e,
    ]);
  };

  return (
    <div className="space-y-4" data-testid="kit-relecteur">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("relectureNative.kit.titre")}</CardTitle>
          <CardDescription>{t("relectureNative.kit.aide")}</CardDescription>
        </CardHeader>
        <CardPanel className="space-y-3">
          {relecteur.statut === "invite" && (
            <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm font-medium">
              {t("relectureNative.kit.test", { n: TAILLE_TEST_KIT })}
            </p>
          )}
          {posts.length > 0 && (
            <div className="space-y-1">
              <Progress value={(avancement.rendus / avancement.total) * 100} />
              <p className="text-xs text-muted-foreground">
                {t("relectureNative.kit.avancement", { rendus: avancement.rendus, total: avancement.total })}
              </p>
            </div>
          )}
          {posts.length === 0 ? (
            <EmptyState title={t("relectureNative.kit.vide")} />
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label={t("relectureNative.kit.liste")}>
              {posts.map((p) => {
                const etat = etatPostKit(parPost.get(p.id));
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setChoisi(p.id)}
                      aria-current={p.id === post?.id}
                      className={cn(
                        "flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs",
                        p.id === post?.id ? "border-primary bg-primary/5" : "hover:bg-accent/50",
                      )}
                    >
                      <span className="font-medium">{t("relectureNative.kit.post", { rang: p.rang })}</span>
                      <Badge variant={VARIANTE_ETAT[etat]}>{t(`relectureNative.kit.etats.${etat}`)}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardPanel>
      </Card>

      {post && (
        <EditeurPostKit
          key={post.id}
          relecteurId={relecteur.id}
          post={post}
          ecriture={parPost.get(post.id)}
          presentation={presentations.data?.find((a) => a.application_id === post.application_id)}
          onEnregistre={memoriser}
          onSuivant={suivant ? () => setChoisi(suivant.id) : undefined}
        />
      )}
    </div>
  );
}

function EditeurPostKit({
  relecteurId,
  post,
  ecriture,
  presentation,
  onEnregistre,
  onSuivant,
}: {
  relecteurId: string;
  post: PostKit;
  ecriture: EcritureKit | undefined;
  presentation: PresentationAppli | undefined;
  onEnregistre: (e: EcritureKit) => void;
  onSuivant?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [slides, setSlides] = React.useState(ecriture?.slides ?? []);
  const [remarque, setRemarque] = React.useState(ecriture?.remarque ?? "");
  const renduAt = ecriture?.rendu_at ?? null;
  const appli = presentation ? nomApplication({ nom: presentation.nom, slug: presentation.slug }) : "";

  const enregistrer = useMutation({
    mutationFn: (e: Pick<EcritureKit, "slides" | "remarque" | "rendu_at">) =>
      enregistrerEcritureKit(relecteurId, post.id, e),
    onSuccess: (_, e) => onEnregistre({ relecteur_id: relecteurId, kit_id: post.id, ...e }),
  });
  const sauver = (patch: Partial<Pick<EcritureKit, "slides" | "remarque" | "rendu_at">>) =>
    enregistrer.mutate({ slides, remarque, rendu_at: renduAt, ...patch });

  const slidesEn = [...post.slides_en].sort((a, b) => a.position - b.position);
  const pret = toutesSlidesEcrites(slidesEn, slides);
  const slideAppli = post.voie === "libre" ? null : post.slide_cta;

  return (
    <Card data-testid={`post-kit-${post.rang}`}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          {t("relectureNative.kit.post", { rang: post.rang })}
          {appli && <Badge variant="outline">{appli}</Badge>}
          <Badge variant="info">{t(`relectureNative.kit.voiesCourtes.${post.voie}`)}</Badge>
          {renduAt && <Badge variant="success">{t("relectureNative.kit.etats.rendu")}</Badge>}
        </CardTitle>
        <CardDescription>{accrochePost(post)}</CardDescription>
      </CardHeader>
      <CardPanel className="space-y-5">
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{t("relectureNative.kit.consigne")}</p>
          <p>
            {post.voie === "reprise" && post.slide_cta
              ? t("relectureNative.kit.voies.reprise", { appli, slide: post.slide_cta })
              : t(`relectureNative.kit.voies.${post.voie === "reprise" ? "repriseSansSlide" : post.voie}`, { appli })}
          </p>
          {post.consigne_cta.trim() && <p className="whitespace-pre-wrap">{post.consigne_cta}</p>}
          {post.a_adapter.trim() && (
            <div className="space-y-1">
              <p className="font-medium">{t("relectureNative.kit.aAdapter")}</p>
              <p className="whitespace-pre-wrap">{post.a_adapter}</p>
            </div>
          )}
          {presentation?.presentation.trim() && (
            <div className="space-y-1">
              <p className="font-medium">{t("relectureNative.kit.presentation", { appli })}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{presentation.presentation}</p>
            </div>
          )}
        </div>

        <ol className="space-y-5">
          {slidesEn.map((s) => {
            const cta = slideAppli === s.position;
            const ecrit = texteEcrit(slides, s.position);
            const enregistre = texteEcrit(ecriture?.slides ?? [], s.position);
            const id = `kit-${post.id}-${s.position}`;
            return (
              <li
                key={s.position}
                className={cn(
                  "grid gap-3 rounded-lg border p-3 sm:grid-cols-[144px_minmax(0,1fr)]",
                  cta && "border-primary/50 bg-primary/5",
                )}
                data-testid={`slide-kit-${s.position}`}
              >
                {s.image_url ? (
                  <a href={s.image_url} target="_blank" rel="noreferrer" className="block w-36">
                    <img
                      src={s.image_url}
                      alt={t("relectureNative.kit.slide", { n: s.position })}
                      loading="lazy"
                      className="aspect-[9/16] w-36 rounded-md border object-cover"
                    />
                  </a>
                ) : (
                  <div className="aspect-[9/16] w-36 rounded-md border border-dashed bg-muted/40" />
                )}
                <div className="min-w-0 space-y-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    {t("relectureNative.kit.slide", { n: s.position })}
                    {cta && <Badge variant="info">{t("relectureNative.kit.slideAppli", { appli })}</Badge>}
                  </p>
                  <div className="space-y-0.5">
                    <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      {t("relectureNative.kit.anglais")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{s.texte}</p>
                  </div>
                  <label htmlFor={id} className="block text-[11px] tracking-wide text-muted-foreground uppercase">
                    {t("relectureNative.kit.taVersion")}
                  </label>
                  <Textarea
                    id={id}
                    dir="auto"
                    rows={Math.min(8, Math.max(2, s.texte.split("\n").length))}
                    aria-label={t("relectureNative.kit.taVersionSlide", { n: s.position })}
                    value={ecrit}
                    onChange={(e) => setSlides((avant) => avecSlideEcrite(avant, s.position, e.target.value))}
                    onBlur={() => {
                      if (ecrit !== enregistre) sauver({});
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("relectureNative.kit.remarque")}</span>
          <span className="block text-xs text-muted-foreground">{t("relectureNative.kit.remarqueAide")}</span>
          <Textarea
            dir="auto"
            rows={2}
            value={remarque}
            onChange={(e) => setRemarque(e.target.value)}
            onBlur={() => {
              if (remarque !== (ecriture?.remarque ?? "")) sauver({});
            }}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          {!renduAt && (
            <Button disabled={!pret || enregistrer.isPending} onClick={() => sauver({ rendu_at: new Date().toISOString() })}>
              {t("relectureNative.kit.rendre")}
            </Button>
          )}
          {!renduAt && !pret && <span className="text-xs text-muted-foreground">{t("relectureNative.kit.rendreAide")}</span>}
          {renduAt && (
            <span className="text-sm text-muted-foreground">
              {t("relectureNative.kit.rendu", { date: new Date(renduAt).toLocaleDateString(i18n.language) })}
            </span>
          )}
          {renduAt && onSuivant && (
            <Button variant="outline" onClick={onSuivant}>
              {t("relectureNative.kit.suivant")}
            </Button>
          )}
          {enregistrer.isPending && <span className="text-xs text-muted-foreground">{t("relectureNative.poster.enregistrement")}</span>}
          {enregistrer.isSuccess && !enregistrer.isPending && (
            <span className="text-xs text-muted-foreground">{t("relectureNative.poster.enregistre")}</span>
          )}
          {enregistrer.error && <span className="text-xs text-destructive">{messageErreur(enregistrer.error)}</span>}
        </div>
      </CardPanel>
    </Card>
  );
}
