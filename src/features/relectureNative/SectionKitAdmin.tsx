import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Replie } from "@/components/ui/replie";
import { Textarea } from "@/components/ui/textarea";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { TikTokEmbed } from "@/features/reviews/TikTokEmbed";

import { ajouterPostKit, listerEcrituresKit, listerKit, majPostKit, supprimerPostKit } from "./api";
import { accrochePost, TAILLE_TEST_KIT, VOIES_KIT, type PostKit, type VoieKit } from "./kit";
import { messageErreur } from "./messageErreur";

export const CLE_REQUETE_KIT = ["kit-natif"] as const;
export const CLE_REQUETE_ECRITURES_KIT = ["kit-natif-ecritures"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Le kit natif côté admin : les posts que chaque relecteur écrit de A à Z,
 * leur appli, leur voie de CTA et la consigne montrée au relecteur.
 */
export function SectionKitAdmin() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { applications } = useApplication();
  const kit = useQuery({ queryKey: CLE_REQUETE_KIT, queryFn: listerKit });
  const ecritures = useQuery({ queryKey: CLE_REQUETE_ECRITURES_KIT, queryFn: () => listerEcrituresKit() });

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

  const actifs = (kit.data ?? []).filter((p) => p.actif).length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("relectureNative.kitAdmin.aide", { n: TAILLE_TEST_KIT })}</p>
      {kit.error && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(kit.error)}
        </p>
      )}
      {kit.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {kit.data?.length === 0 && <EmptyState title={t("relectureNative.kitAdmin.vide")} />}
      {(kit.data?.length ?? 0) > 0 && (
        <p className="text-sm">{t("relectureNative.kitAdmin.compte", { n: actifs })}</p>
      )}

      {(kit.data ?? []).map((p) => (
        <CartePostKit key={p.id} post={p} rendus={rendusParPost.get(p.id) ?? 0} onChange={rafraichir} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("relectureNative.kitAdmin.ajouterTitre")}</CardTitle>
          <CardDescription>{t("relectureNative.kitAdmin.ajouterAide")}</CardDescription>
        </CardHeader>
        <CardPanel>
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
              {t("relectureNative.kitAdmin.ajouter")}
            </Button>
          </form>
          {ajouter.error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {messageErreur(ajouter.error)}
            </p>
          )}
        </CardPanel>
      </Card>
    </div>
  );
}

function CartePostKit({ post, rendus, onChange }: { post: PostKit; rendus: number; onChange: () => void }) {
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
  const app = applications.find((a) => a.id === post.application_id);
  const rangValide = Number.isInteger(Number(f.rang)) && Number(f.rang) > 0;

  return (
    <Card data-testid={`kit-admin-${post.rang}`} className={post.actif ? undefined : "opacity-60"}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          #{post.rang}
          {post.rang <= TAILLE_TEST_KIT && <Badge variant="info">{t("relectureNative.kitAdmin.test")}</Badge>}
          {app && <Badge variant="outline">{nomApplication(app)}</Badge>}
          <Badge variant="secondary">{t(`relectureNative.kitAdmin.voies.${post.voie}`)}</Badge>
          <span className="text-xs font-normal text-muted-foreground">
            {t("relectureNative.kitAdmin.slides", { n: post.slides_en.length })} ·{" "}
            {t("relectureNative.kitAdmin.rendus", { n: rendus })}
          </span>
          {!post.actif && <Badge variant="warning">{t("relectureNative.kitAdmin.horsKit")}</Badge>}
        </CardTitle>
        <CardDescription>{accrochePost(post)}</CardDescription>
      </CardHeader>
      <CardPanel className="space-y-4">
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
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">{t("relectureNative.kitAdmin.consigne")}</span>
          <Textarea rows={2} value={f.consigne_cta} onChange={(e) => setF({ ...f, consigne_cta: e.target.value })} />
        </label>
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">{t("relectureNative.kitAdmin.aAdapter")}</span>
          <Textarea rows={2} value={f.a_adapter} onChange={(e) => setF({ ...f, a_adapter: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} />
          {t("relectureNative.kitAdmin.actif")}
        </label>

        <Replie titre={t("relectureNative.kitAdmin.apercu")}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,325px)_minmax(0,1fr)]">
            {post.source_url ? (
              <TikTokEmbed
                url={post.source_url}
                titre="TikTok"
                videLabel={t("relectureNative.kit.sansTiktok")}
                chargementLabel={t("relectureNative.kit.apercuChargement")}
              />
            ) : (
              <p className="text-xs text-muted-foreground">{t("relectureNative.kitAdmin.sansSource")}</p>
            )}
            <ol className="space-y-2">
              {post.slides_en.map((s) => (
                <li key={s.position} className="flex gap-3 text-sm">
                  {s.image_url && (
                    <img src={s.image_url} alt="" loading="lazy" className="aspect-[9/16] w-16 shrink-0 rounded border object-cover" />
                  )}
                  <p className="whitespace-pre-wrap">
                    <span className="font-medium">{s.position}. </span>
                    {s.texte}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </Replie>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!modifie || !rangValide || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
            {t("relectureNative.fiches.enregistrer")}
          </Button>
          {modifie && <span className="text-xs text-muted-foreground">{t("relectureNative.fiches.nonEnregistre")}</span>}
          <Button
            variant="ghost"
            size="sm"
            disabled={supprimer.isPending}
            onClick={() => {
              if (window.confirm(t("relectureNative.kitAdmin.confirmerSuppression", { n: rendus }))) supprimer.mutate();
            }}
          >
            {t("relectureNative.kitAdmin.supprimer")}
          </Button>
          {(enregistrer.error ?? supprimer.error) && (
            <span role="alert" className="text-xs text-destructive">
              {messageErreur(enregistrer.error ?? supprimer.error)}
            </span>
          )}
        </div>
      </CardPanel>
    </Card>
  );
}
