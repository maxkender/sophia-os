import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronUp,
  EyeOff,
  Globe2,
  Images,
  Layers,
  Megaphone,
  Pencil,
  Plus,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardPanel, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { Replie } from "@/components/ui/replie";
import { Textarea } from "@/components/ui/textarea";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { TikTokEmbed } from "@/features/reviews/TikTokEmbed";
import { cn } from "@/lib/utils";

import { ajouterPostKit, listerEcrituresKit, listerKit, majPostKit, supprimerPostKit } from "./api";
import { VOIE } from "./apparence";
import { accrochePost, VOIES_KIT, type PostKit, type VoieKit } from "./kit";
import { messageErreur } from "./messageErreur";
import { Puce, TuileIcone } from "./Puces";

export const CLE_REQUETE_KIT = ["kit-natif"] as const;
export const CLE_REQUETE_ECRITURES_KIT = ["kit-natif-ecritures"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Le kit natif côté admin : les posts que chaque relecteur écrit de A à Z,
 * en liste compacte ; chaque post s'ouvre pour changer son appli, sa voie de
 * CTA et la consigne montrée au relecteur.
 */
export function SectionKitAdmin() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { applications } = useApplication();
  const kit = useQuery({ queryKey: CLE_REQUETE_KIT, queryFn: listerKit });
  const ecritures = useQuery({ queryKey: CLE_REQUETE_ECRITURES_KIT, queryFn: () => listerEcrituresKit() });
  const [ouvert, setOuvert] = React.useState<string | null>(null);

  const [contenuId, setContenuId] = React.useState("");
  const [appliAjout, setAppliAjout] = React.useState("");
  const [voieAjout, setVoieAjout] = React.useState<VoieKit>("libre");
  const appli = appliAjout || applications[0]?.id || "";
  const rafraichir = () => void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_KIT });
  const ajouter = useMutation({
    mutationFn: () => ajouterPostKit(contenuId.trim(), appli, voieAjout),
    onSuccess: () => {
      setContenuId("");
      rafraichir();
    },
  });

  const rendusParPost = React.useMemo(() => {
    const n = new Map<string, number>();
    for (const e of ecritures.data ?? []) if (e.rendu_at) n.set(e.kit_id, (n.get(e.kit_id) ?? 0) + 1);
    return n;
  }, [ecritures.data]);

  const posts = kit.data ?? [];
  const actifs = posts.filter((p) => p.actif);
  const slides = actifs.reduce((n, p) => n + p.slides_en.length, 0);

  return (
    <div className="space-y-4">
      {kit.error && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(kit.error)}
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
          <TuileIcone icone={Layers} ton="violet" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("relectureNative.kitAdmin.titre")}</p>
            <p className="text-xs text-muted-foreground">{t("relectureNative.kitAdmin.aide")}</p>
          </div>
          {posts.length > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("relectureNative.kitAdmin.compte", { n: actifs.length, slides })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-b bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
          {VOIES_KIT.map((v) => {
            const { icone: Icone } = VOIE[v];
            return (
              <span key={v} className="flex items-center gap-1.5">
                <Puce icone={Icone} ton={VOIE[v].ton}>
                  {t(`relectureNative.kitAdmin.voies.${v}`)}
                </Puce>
                {t(`relectureNative.kitAdmin.voiesAide.${v}`)}
              </span>
            );
          })}
        </div>

        {kit.isPending && <p className="px-5 py-4 text-sm text-muted-foreground">{t("common.loading")}</p>}
        {kit.data?.length === 0 && (
          <div className="p-5">
            <EmptyState title={t("relectureNative.kitAdmin.vide")} />
          </div>
        )}
        <ul className="divide-y">
          {posts.map((p) => (
            <LignePostKit
              key={p.id}
              post={p}
              rendus={rendusParPost.get(p.id) ?? 0}
              ouvert={ouvert === p.id}
              onOuvrir={() => setOuvert((o) => (o === p.id ? null : p.id))}
              onChange={rafraichir}
            />
          ))}
        </ul>
      </Card>

      <Card>
        <CardPanel className="space-y-4">
          <div className="flex items-start gap-3">
            <TuileIcone icone={Plus} />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold">{t("relectureNative.kitAdmin.ajouterTitre")}</p>
              <p className="text-xs text-muted-foreground">{t("relectureNative.kitAdmin.ajouterAide")}</p>
            </div>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (contenuId.trim() && appli) ajouter.mutate();
            }}
          >
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t("relectureNative.kitAdmin.contenuId")}</span>
              <Input value={contenuId} onChange={(e) => setContenuId(e.target.value)} placeholder="1ab301c9-…" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t("relectureNative.kitAdmin.appli")}</span>
              <select className={selectClass} value={appli} onChange={(e) => setAppliAjout(e.target.value)}>
                {applications.map((a) => (
                  <option key={a.id} value={a.id}>
                    {nomApplication(a)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t("relectureNative.kitAdmin.voie")}</span>
              <select className={selectClass} value={voieAjout} onChange={(e) => setVoieAjout(e.target.value as VoieKit)}>
                {VOIES_KIT.map((v) => (
                  <option key={v} value={v}>
                    {t(`relectureNative.kitAdmin.voies.${v}`)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={!contenuId.trim() || !appli || ajouter.isPending}>
              <Plus />
              {t("relectureNative.kitAdmin.ajouter")}
            </Button>
          </form>
          {ajouter.error && (
            <p role="alert" className="text-xs text-destructive">
              {messageErreur(ajouter.error)}
            </p>
          )}
        </CardPanel>
      </Card>
    </div>
  );
}

function LignePostKit({
  post,
  rendus,
  ouvert,
  onOuvrir,
  onChange,
}: {
  post: PostKit;
  rendus: number;
  ouvert: boolean;
  onOuvrir: () => void;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const { applications } = useApplication();
  const app = applications.find((a) => a.id === post.application_id);
  const voie = VOIE[post.voie];
  const vignette = [...post.slides_en].sort((a, b) => a.position - b.position)[0]?.image_url;

  return (
    <li data-testid={`kit-admin-${post.rang}`} className={cn(!post.actif && "bg-muted/30")}>
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular-nums">
          {post.rang}
        </span>
        {vignette ? (
          <img src={vignette} alt="" loading="lazy" className="aspect-[9/16] w-9 shrink-0 rounded border bg-muted object-cover" />
        ) : (
          <span className="aspect-[9/16] w-9 shrink-0 rounded border border-dashed bg-muted/40" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className={cn("truncate text-sm font-medium", !post.actif && "text-muted-foreground")}>{accrochePost(post)}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {app && <Puce icone={Smartphone}>{nomApplication(app)}</Puce>}
            <Puce icone={voie.icone} ton={voie.ton}>
              {t(`relectureNative.kitAdmin.voies.${post.voie}`)}
            </Puce>
            {post.voie !== "libre" && post.slide_cta && (
              <Puce icone={Megaphone}>{t("relectureNative.kitAdmin.slideN", { n: post.slide_cta })}</Puce>
            )}
            <Puce icone={Images}>{t("relectureNative.kitAdmin.slides", { n: post.slides_en.length })}</Puce>
            <Puce icone={CheckCircle2} ton={rendus > 0 ? "vert" : "neutre"}>
              {t("relectureNative.kitAdmin.rendus", { n: rendus })}
            </Puce>
            {!post.actif && (
              <Puce icone={EyeOff} ton="ambre">
                {t("relectureNative.kitAdmin.horsKit")}
              </Puce>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onOuvrir} aria-expanded={ouvert}>
          {ouvert ? <ChevronUp /> : <Pencil />}
          {ouvert ? t("relectureNative.kitAdmin.fermer") : t("relectureNative.kitAdmin.modifier")}
        </Button>
      </div>
      {ouvert && <EditionPostKit post={post} rendus={rendus} onChange={onChange} />}
    </li>
  );
}

function EditionPostKit({ post, rendus, onChange }: { post: PostKit; rendus: number; onChange: () => void }) {
  const { t } = useTranslation();
  const { applications } = useApplication();
  const initial = React.useMemo(
    () => ({
      rang: String(post.rang),
      application_id: post.application_id,
      voie: post.voie,
      slide_cta: post.slide_cta ? String(post.slide_cta) : "",
      consigne_cta: post.consigne_cta,
      a_adapter: post.a_adapter,
      actif: post.actif,
    }),
    [post],
  );
  const [f, setF] = React.useState(initial);
  React.useEffect(() => setF(initial), [initial]);
  const modifie = JSON.stringify(f) !== JSON.stringify(initial);
  const rangValide = Number.isInteger(Number(f.rang)) && Number(f.rang) > 0;

  const enregistrer = useMutation({
    mutationFn: () =>
      majPostKit(post.id, {
        rang: Number(f.rang),
        application_id: f.application_id,
        voie: f.voie,
        slide_cta: f.slide_cta ? Number(f.slide_cta) : null,
        consigne_cta: f.consigne_cta,
        a_adapter: f.a_adapter,
        actif: f.actif,
      }),
    onSuccess: onChange,
  });
  const supprimer = useMutation({ mutationFn: () => supprimerPostKit(post.id), onSuccess: onChange });

  return (
    <div className="space-y-5 border-t bg-muted/20 px-5 py-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t("relectureNative.kitAdmin.rang")}</span>
          <Input type="number" min={1} value={f.rang} onChange={(e) => setF({ ...f, rang: e.target.value })} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t("relectureNative.kitAdmin.appli")}</span>
          <select className={selectClass} value={f.application_id} onChange={(e) => setF({ ...f, application_id: e.target.value })}>
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {nomApplication(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t("relectureNative.kitAdmin.voie")}</span>
          <select className={selectClass} value={f.voie} onChange={(e) => setF({ ...f, voie: e.target.value as VoieKit })}>
            {VOIES_KIT.map((v) => (
              <option key={v} value={v}>
                {t(`relectureNative.kitAdmin.voies.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t("relectureNative.kitAdmin.slideCta")}</span>
          <select className={selectClass} value={f.slide_cta} onChange={(e) => setF({ ...f, slide_cta: e.target.value })}>
            <option value="">{t("relectureNative.kitAdmin.aucune")}</option>
            {post.slides_en.map((s) => (
              <option key={s.position} value={String(s.position)}>
                {s.position}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Megaphone className="size-3.5" aria-hidden />
            {t("relectureNative.kitAdmin.consigne")}
          </span>
          <Textarea rows={3} value={f.consigne_cta} onChange={(e) => setF({ ...f, consigne_cta: e.target.value })} />
        </label>
        <label className="block space-y-1 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Globe2 className="size-3.5" aria-hidden />
            {t("relectureNative.kitAdmin.aAdapter")}
          </span>
          <Textarea rows={3} value={f.a_adapter} onChange={(e) => setF({ ...f, a_adapter: e.target.value })} />
        </label>
      </div>

      <div className="space-y-2">
        <p className={MICRO_LABEL}>{t("relectureNative.kitAdmin.lesSlides")}</p>
        <ol className="flex gap-3 overflow-x-auto pb-2">
          {[...post.slides_en]
            .sort((a, b) => a.position - b.position)
            .map((s) => (
              <li
                key={s.position}
                className={cn(
                  "w-32 shrink-0 space-y-1.5 rounded-lg border bg-card p-1.5",
                  f.voie !== "libre" && f.slide_cta === String(s.position) && "border-info/50 ring-1 ring-info/20",
                )}
              >
                {s.image_url ? (
                  <img src={s.image_url} alt="" loading="lazy" className="aspect-[9/16] w-full rounded border bg-muted object-cover" />
                ) : (
                  <div className="aspect-[9/16] w-full rounded border border-dashed bg-muted/40" />
                )}
                <p className="line-clamp-4 text-[11px] leading-snug text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.position}. </span>
                  {s.texte}
                </p>
              </li>
            ))}
        </ol>
      </div>

      {post.source_url && (
        <Replie titre={t("relectureNative.kitAdmin.apercu")}>
          <div className="max-w-[325px]">
            <TikTokEmbed
              url={post.source_url}
              titre="TikTok"
              videLabel={t("relectureNative.kit.sansTiktok")}
              chargementLabel={t("relectureNative.kit.apercuChargement")}
            />
          </div>
        </Replie>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="mr-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} />
          {t("relectureNative.kitAdmin.actif")}
        </label>
        {(enregistrer.error ?? supprimer.error) && (
          <span role="alert" className="text-xs text-destructive">
            {messageErreur(enregistrer.error ?? supprimer.error)}
          </span>
        )}
        {modifie && <span className="text-xs text-muted-foreground">{t("relectureNative.fiches.nonEnregistre")}</span>}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={supprimer.isPending}
          onClick={() => {
            if (window.confirm(t("relectureNative.kitAdmin.confirmerSuppression", { n: rendus }))) supprimer.mutate();
          }}
        >
          <Trash2 />
          {t("relectureNative.kitAdmin.supprimer")}
        </Button>
        <Button disabled={!modifie || !rangValide || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          <Save />
          {t("relectureNative.fiches.enregistrer")}
        </Button>
      </div>
    </div>
  );
}
