import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Megaphone, MessageSquare, PenLine } from "lucide-react";

import { Card, EmptyState } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { Progress } from "@/components/ui/progress";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

import { listerEcrituresKit, listerKit, listerRelecteurs } from "./api";
import { ETAT, VOIE } from "./apparence";
import { accrochePost, avancementKit, etatPostKit, postsDuKit, texteEcrit } from "./kit";
import { messageErreur } from "./messageErreur";
import { Puce, TuileIcone } from "./Puces";
import { CLE_REQUETE_ECRITURES_KIT, CLE_REQUETE_KIT } from "./SectionKitAdmin";
import { CLE_REQUETE_RELECTEURS } from "./SectionRelecteurs";

const selectClass =
  "h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Les versions d'un relecteur, post par post : l'anglais à gauche, sa version à droite. */
export function SectionEcrituresKit({
  relecteurId,
  onChoisir,
}: {
  relecteurId: string | null;
  onChoisir: (relecteurId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const relecteurs = useQuery({ queryKey: CLE_REQUETE_RELECTEURS, queryFn: listerRelecteurs });
  const kit = useQuery({ queryKey: CLE_REQUETE_KIT, queryFn: listerKit });
  const ecritures = useQuery({ queryKey: CLE_REQUETE_ECRITURES_KIT, queryFn: () => listerEcrituresKit() });

  const erreur = relecteurs.error ?? kit.error ?? ecritures.error;
  if (erreur) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(erreur)}
      </p>
    );
  }
  if (relecteurs.data?.length === 0) return <EmptyState title={t("relectureNative.relecteurs.vide")} />;
  if (!relecteurs.data || !kit.data || !ecritures.data) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const choisi = relecteurId ?? relecteurs.data[0]?.id ?? null;
  const relecteur = relecteurs.data.find((r) => r.id === choisi);
  const siennes = new Map(ecritures.data.filter((e) => e.relecteur_id === choisi).map((e) => [e.kit_id, e]));
  const posts = postsDuKit(kit.data);
  const avancement = avancementKit(posts, [...siennes.values()]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4 px-5 py-4">
          <TuileIcone icone={PenLine} ton="violet" className="self-center" />
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t("relectureNative.reponses.relecteur")}</span>
            <select className={selectClass} value={choisi ?? ""} onChange={(e) => onChoisir(e.target.value)}>
              {relecteurs.data.map((r) => (
                <option key={r.id} value={r.id}>
                  {drapeauLangue(r.langue)} {nomLangue(r.langue)} · {[r.prenom, r.nom].filter(Boolean).join(" ") || r.email}
                </option>
              ))}
            </select>
          </label>
          {relecteur && (
            <div className="w-full space-y-1 sm:w-56">
              <p className="text-right text-xs tabular-nums text-muted-foreground">
                {t("relectureNative.kit.avancement", { rendus: avancement.rendus, total: avancement.total })}
              </p>
              <Progress value={avancement.total ? (avancement.rendus / avancement.total) * 100 : 0} />
            </div>
          )}
        </div>
      </Card>

      {relecteur && !relecteur.questionnaire_termine_at && (
        <p className="text-sm text-muted-foreground">{t("relectureNative.ecrituresKit.questionnaireAvant")}</p>
      )}

      {posts.map((p) => {
        const e = siennes.get(p.id);
        const etat = etatPostKit(e);
        const voie = VOIE[p.voie];
        return (
          <Card key={p.id} className="overflow-hidden" data-testid={`ecriture-kit-${p.rang}`}>
            <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular-nums">
                {p.rang}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{accrochePost(p)}</p>
              <Puce icone={voie.icone} ton={voie.ton}>
                {t(`relectureNative.kitAdmin.voies.${p.voie}`)}
              </Puce>
              <Puce icone={ETAT[etat].icone} ton={ETAT[etat].ton}>
                {e?.rendu_at
                  ? t("relectureNative.ecrituresKit.renduLe", {
                      date: new Date(e.rendu_at).toLocaleDateString(i18n.language),
                    })
                  : t(`relectureNative.kit.etats.${etat}`)}
              </Puce>
            </div>
            {e ? (
              <div className="divide-y">
                <div className="hidden grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-5 py-2 sm:grid">
                  <span />
                  <span className={MICRO_LABEL}>{t("relectureNative.kit.anglais")}</span>
                  <span className={MICRO_LABEL}>{t("relectureNative.ecrituresKit.version")}</span>
                </div>
                {[...p.slides_en]
                  .sort((a, b) => a.position - b.position)
                  .map((s) => {
                    const cta = p.voie !== "libre" && p.slide_cta === s.position;
                    const version = texteEcrit(e.slides, s.position);
                    return (
                      <div
                        key={s.position}
                        className={cn(
                          "grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 gap-y-2 px-5 py-3 text-sm sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)]",
                          cta && "bg-info/5",
                        )}
                      >
                        <div className="row-span-2 space-y-1 sm:row-span-1">
                          {s.image_url ? (
                            <img src={s.image_url} alt="" loading="lazy" className="aspect-[9/16] w-12 rounded border bg-muted object-cover" />
                          ) : (
                            <span className="flex aspect-[9/16] w-12 items-center justify-center rounded border border-dashed text-xs">
                              {s.position}
                            </span>
                          )}
                          {cta && <Megaphone className="mx-auto size-3.5 text-info-foreground" aria-label={t("relectureNative.ecrituresKit.slideAppli")} />}
                        </div>
                        <p className="whitespace-pre-wrap text-muted-foreground">{s.texte}</p>
                        <p className={cn("whitespace-pre-wrap", !version && "text-muted-foreground italic")} dir="auto">
                          {version || t("relectureNative.ecrituresKit.pasEcrit")}
                        </p>
                      </div>
                    );
                  })}
                {e.remarque.trim() && (
                  <p className="flex items-start gap-2 bg-muted/30 px-5 py-3 text-sm">
                    <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>
                      <span className="font-medium">{t("relectureNative.ecrituresKit.remarque")} </span>
                      <span dir="auto" className="whitespace-pre-wrap">
                        {e.remarque}
                      </span>
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <p className="px-5 py-3 text-sm text-muted-foreground">{t("relectureNative.ecrituresKit.pasCommence")}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
