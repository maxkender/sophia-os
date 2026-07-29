import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { LabelEditor } from "@/features/moteur/LabelPicker";
import {
  labelsDuContenu,
  lireSlideshow,
  listerContenus,
  renseignerLienPublie,
  setLabelsContenu,
  type ContenuListe,
  type SlideshowDetail,
} from "@/features/moteur/api";
import { nomLangue } from "@/features/moteur/langues";
import type { ContenuLangue, ContenuSlide } from "@/features/moteur/types";
import { cn } from "@/lib/utils";

function PassageLien({
  passageId,
  postId,
  publieUrl,
  statut,
  contenuId,
}: {
  passageId: string;
  postId: string | null;
  publieUrl: string | null;
  statut: string;
  contenuId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const peutEditer = statut === "publie";
  const [edit, setEdit] = React.useState(peutEditer && !publieUrl);
  const [url, setUrl] = React.useState(publieUrl ?? "");
  const save = useMutation({
    mutationFn: () => renseignerLienPublie({ passageId, postId }, url),
    onSuccess: () => {
      setEdit(false);
      void queryClient.invalidateQueries({ queryKey: ["slideshow", contenuId] });
      void queryClient.invalidateQueries({ queryKey: ["publications-compte"] });
    },
  });

  if (!peutEditer && !publieUrl) return null;

  if (!edit && publieUrl) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <a
          href={publieUrl}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          TikTok ↗
        </a>
        {peutEditer && (
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-2"
            onClick={() => {
              setUrl(publieUrl);
              setEdit(true);
            }}
          >
            {t("slideshows.modifierLien")}
          </button>
        )}
      </div>
    );
  }

  if (!edit) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t("slideshows.lienPlaceholder")}
        className="h-7 min-w-[12rem] flex-1 text-xs"
      />
      <Button
        size="sm"
        className="h-7"
        disabled={save.isPending || !url.trim()}
        onClick={() => save.mutate()}
      >
        {save.isPending ? t("common.saving") : t("common.save")}
      </Button>
      {publieUrl && (
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setEdit(false)}>
          {t("common.cancel")}
        </Button>
      )}
    </div>
  );
}

function urlPropre(c: ContenuListe, slide: ContenuSlide): string | null {
  if (slide.media_id && c.mediaUrls?.[slide.media_id]) return c.mediaUrls[slide.media_id];
  return null;
}

function vignette(c: ContenuListe): string | null {
  const slides = [...(c.structure_slides ?? [])].sort((a, b) => a.position - b.position);
  for (const s of slides) {
    const propre = urlPropre(c, s);
    if (propre) return propre;
  }
  const first = slides[0];
  return first?.raw_url ?? first?.reference_url ?? null;
}

function DeckLangue({
  contenu,
  langue,
  estSource,
}: {
  contenu: SlideshowDetail;
  langue: ContenuLangue;
  estSource: boolean;
}) {
  const { t } = useTranslation();
  const structure = [...(contenu.structure_slides ?? [])].sort((a, b) => a.position - b.position);
  const textes = new Map(
    (langue.slides ?? []).map((s) => [s.position, s] as const),
  );

  const aTexte = (langue.slides ?? []).some((s) => s.texte_overlay?.trim());

  if (structure.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("slideshows.deckVide")}</p>;
  }

  if (!estSource && !aTexte) {
    return (
      <p className="text-xs text-muted-foreground">{t("slideshows.deckLazy")}</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        {estSource
          ? t("slideshows.deckSourceAide")
          : t("slideshows.deckTradAide")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {structure.map((s) => {
          const img = urlPropre(contenu, s) ?? s.raw_url ?? s.reference_url;
          const meta = textes.get(s.position);
          const texte = meta?.texte_overlay?.trim() || null;
          const sophia = Boolean(meta?.position_sophia);
          return (
            <div key={s.position} className="overflow-hidden rounded border">
              {img ? (
                <img src={img} alt="" className="aspect-[3/4] w-full object-cover" />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center bg-muted text-[10px] text-muted-foreground">
                  #{s.position}
                </div>
              )}
              <div className="space-y-1 p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-muted-foreground">#{s.position}</span>
                  {sophia && (
                    <Badge variant="success" className="text-[10px]">
                      Sophia
                    </Badge>
                  )}
                </div>
                {texte ? (
                  <p className="text-xs leading-snug">{texte}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {t("slideshows.sansTexte")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailSlideshow({
  id,
  onFermer,
}: {
  id: string;
  onFermer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const detail = useQuery({
    queryKey: ["slideshow", id],
    queryFn: () => lireSlideshow(id),
  });

  const d = detail.data as SlideshowDetail | null | undefined;
  const langues = d?.langues ?? [];
  const [langueSel, setLangueSel] = React.useState<string | null>(null);
  const [voirOriginal, setVoirOriginal] = React.useState(false);

  React.useEffect(() => {
    if (!d) return;
    const prefer =
      d.langues.find((l) => l.langue === d.langue_source)?.langue ??
      d.langues[0]?.langue ??
      null;
    setLangueSel(prefer);
  }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const langueActive = langues.find((l) => l.langue === langueSel) ?? langues[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50"
      onClick={onFermer}
    >
      <aside
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("slideshows.detail")}</h2>
          <Button size="icon" variant="ghost" aria-label={t("common.cancel")} onClick={onFermer}>
            <X className="size-4" />
          </Button>
        </div>

        {detail.isPending && (
          <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
        {detail.isError && (
          <p className="p-4 text-sm text-destructive">{(detail.error as Error).message}</p>
        )}
        {d && (
          <div className="space-y-5 p-4">
            <div>
              <p className="text-base font-medium">{d.titre || t("contenus.sansTitre")}</p>
              <p className="text-xs text-muted-foreground">
                {d.source?.handle_tiktok ? `@${d.source.handle_tiktok}` : "—"}
                {" · "}
                {t("slideshows.langueSource")}: {d.langue_source.toUpperCase()}
                {d.parent_id ? ` · ${t("contenus.variation")}` : ""}
              </p>
              {d.source_url && (
                <a
                  href={d.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-xs underline underline-offset-2"
                >
                  {t("slideshows.voirSource")}
                </a>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  d.statut === "valide"
                    ? "success"
                    : d.statut === "rejete"
                      ? "destructive"
                      : "secondary"
                }
              >
                {d.statut}
              </Badge>
              <Badge variant="outline">{d.import_statut}</Badge>
              {d.import_etape && <Badge variant="outline">{d.import_etape}</Badge>}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded border p-2">
                <p className="text-muted-foreground">{t("slideshows.pertinence")}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {d.pertinence_score ?? "—"}
                </p>
              </div>
              <div className="rounded border p-2">
                <p className="text-muted-foreground">{t("slideshows.vuesSource")}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {d.vues_source?.toLocaleString(i18n.language) ?? "—"}
                </p>
              </div>
              <div className="rounded border p-2">
                <p className="text-muted-foreground">{t("slideshows.passages")}</p>
                <p className="text-lg font-semibold tabular-nums">{d.passages.length}</p>
              </div>
            </div>

            {d.pertinence_raison && (
              <p className="text-xs text-muted-foreground">{d.pertinence_raison}</p>
            )}
            {d.import_erreur && (
              <p className="text-xs text-destructive">{d.import_erreur}</p>
            )}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("slideshows.elo")}
              </h3>
              {langues.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("slideshows.eloVide")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {langues.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between rounded border px-2.5 py-1.5 text-sm"
                    >
                      <span>
                        {nomLangue(l.langue)}
                        {l.langue === d.langue_source ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({t("slideshows.origine")})
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums">
                        <span className="font-semibold">{l.score.toFixed(1)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("slideshows.nbPassages", { count: l.nb_passages })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("slideshows.decks")}
              </h3>
              {langues.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("slideshows.decksVide")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {langues.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setLangueSel(l.langue)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium",
                          (langueActive?.langue ?? langueSel) === l.langue
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {l.langue.toUpperCase()}
                        <span className="ml-1 opacity-80">{l.score.toFixed(0)}</span>
                      </button>
                    ))}
                  </div>
                  {langueActive && (
                    <DeckLangue
                      contenu={d}
                      langue={langueActive}
                      estSource={langueActive.langue === d.langue_source}
                    />
                  )}
                </>
              )}
            </section>

            <section className="space-y-2">
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setVoirOriginal((v) => !v)}
              >
                {voirOriginal ? t("slideshows.masquerOriginal") : t("slideshows.voirOriginal")}
              </button>
              {voirOriginal && (
                <div className="grid grid-cols-3 gap-1.5">
                  {[...(d.structure_slides ?? [])]
                    .sort((a, b) => a.position - b.position)
                    .map((s) => {
                      const url = s.raw_url ?? s.reference_url;
                      return url ? (
                        <img
                          key={s.position}
                          src={url}
                          alt=""
                          className="aspect-[3/4] w-full rounded border object-cover"
                        />
                      ) : (
                        <div
                          key={s.position}
                          className="flex aspect-[3/4] items-center justify-center rounded border text-[10px] text-muted-foreground"
                        >
                          #{s.position}
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("slideshows.historique")}
              </h3>
              {d.passages.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("slideshows.pasDePassage")}</p>
              ) : (
                <ul className="space-y-2">
                  {d.passages.map((p) => (
                    <li key={p.id} className="rounded border p-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-medium">
                          {p.comptes?.persona_nom ||
                            p.comptes?.handle_tiktok ||
                            p.compte_id.slice(0, 8)}
                        </span>
                        <Badge variant="outline">{p.statut}</Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {p.date_publication_prevue
                          ? new Date(p.date_publication_prevue).toLocaleDateString(
                              i18n.language,
                            )
                          : "—"}
                        {" · "}
                        {nomLangue(p.langue)}
                      </p>
                      <p className="tabular-nums text-muted-foreground">
                        {t("slideshows.statsLigne", {
                          vues: p.vues?.toLocaleString(i18n.language) ?? "—",
                          likes: p.likes?.toLocaleString(i18n.language) ?? "—",
                          coms: p.commentaires?.toLocaleString(i18n.language) ?? "—",
                        })}
                      </p>
                      <PassageLien
                        passageId={p.id}
                        postId={p.post_id}
                        publieUrl={p.publie_url}
                        statut={p.statut}
                        contenuId={d.id}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Labels
              </h3>
              <LabelEditor
                queryKey={["contenu-labels", d.id]}
                load={() => labelsDuContenu(d.id)}
                save={(ids) => setLabelsContenu(d.id, ids)}
              />
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

export function AdminSlideshowsPage() {
  const { t } = useTranslation();
  const [filtre, setFiltre] = React.useState<"tous" | "valide" | "brouillon" | "rejete">(
    "tous",
  );
  const [ouvert, setOuvert] = React.useState<string | null>(null);

  const contenus = useQuery({
    queryKey: ["slideshows", filtre],
    queryFn: () =>
      listerContenus({
        statut: filtre === "tous" ? undefined : filtre,
        limit: 200,
      }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("slideshows.title")}</CardTitle>
          <CardDescription>{t("slideshows.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["tous", "valide", "brouillon", "rejete"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltre(f)}
                className={
                  filtre === f
                    ? "rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                    : "rounded-md border px-3 py-1 text-xs"
                }
              >
                {t(`contenus.filtre.${f}`)}
              </button>
            ))}
          </div>

          {contenus.isPending && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {!contenus.isPending && (contenus.data?.length ?? 0) === 0 && (
            <EmptyState title={t("slideshows.empty")} />
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(contenus.data ?? []).map((c) => {
              const img = vignette(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOuvert(c.id)}
                  className={cn(
                    "overflow-hidden rounded-lg border text-left transition hover:ring-2 hover:ring-primary",
                    c.statut === "rejete" && "opacity-70",
                  )}
                >
                  {img ? (
                    <img src={img} alt="" className="aspect-[3/4] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center bg-muted text-xs text-muted-foreground">
                      {t("slideshows.sansImage")}
                    </div>
                  )}
                  <div className="space-y-1 p-2">
                    <p className="line-clamp-2 text-xs font-medium">
                      {c.titre || t("contenus.sansTitre")}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(c.scores ?? [])
                        .slice()
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 4)
                        .map((s) => (
                          <span
                            key={s.langue}
                            className="rounded border px-1 py-0.5 text-[10px] tabular-nums"
                          >
                            {s.langue.toUpperCase()} {s.score.toFixed(0)}
                          </span>
                        ))}
                    </div>
                    <Badge
                      variant={
                        c.statut === "valide"
                          ? "success"
                          : c.statut === "rejete"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {c.statut}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {ouvert && <DetailSlideshow id={ouvert} onFermer={() => setOuvert(null)} />}
    </div>
  );
}
