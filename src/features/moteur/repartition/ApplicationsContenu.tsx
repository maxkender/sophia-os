import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, messageErreur } from "@/lib/utils";
import {
  listerDecksApplicationsContenu,
  listerPertinencesContenu,
  listerTiersApplicationsContenu,
  majTierContenuApplication,
  relancerRequalifContenuApplication,
} from "../apiMultiApp";
import { nomLangue } from "../langues";
import { ID_SOPHIA } from "../multiApp";
import { estErreurSchemaAbsent } from "../multiapp/logique";
import {
  PASSAGES_PAR_TIER,
  TIERS,
  type ContenuTierEtatApplication,
  type ReglagesTierlist,
  type Tier,
} from "../types";
import { etatRequalifCycle, nomApplicationPromue } from "./logique";
import { useApplicationsMulti } from "./useMultiApp";

/**
 * Détail slideshow : ce que chaque application pense du contenu. Le deck
 * Sophia (`contenu_langues.slides`) reste affiché au-dessus tel quel ; ces deux
 * blocs ne lisent que les tables de 0256 et, avant elle, n'affichent que leur
 * propre erreur — jamais de quoi casser le reste de la fiche.
 */
export function PertinencesApplications({ contenuId }: { contenuId: string }) {
  const { t } = useTranslation();
  const applications = useApplicationsMulti();
  const pertinences = useQuery({
    queryKey: ["contenu-pertinences", contenuId],
    queryFn: () => listerPertinencesContenu(contenuId),
    retry: false,
  });
  const apps = applications.data ?? [];

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("multiAppPosts.pertinences.titre")}
      </h3>
      {pertinences.isPending ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : pertinences.isError ? (
        <p className="text-xs text-destructive">
          {t("multiAppPosts.pertinences.erreur", { message: messageErreur(pertinences.error) })}
        </p>
      ) : (pertinences.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("multiAppPosts.pertinences.vide")}</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5">{t("multiAppPosts.pertinences.app")}</th>
                <th className="px-2 py-1.5 text-right">{t("multiAppPosts.pertinences.score")}</th>
                <th className="px-2 py-1.5 text-right">{t("multiAppPosts.pertinences.note")}</th>
                <th className="px-2 py-1.5">{t("multiAppPosts.pertinences.eligible")}</th>
                <th className="px-2 py-1.5">{t("multiAppPosts.pertinences.raison")}</th>
              </tr>
            </thead>
            <tbody>
              {(pertinences.data ?? []).map((p) => (
                <tr key={p.application_id} className="border-t align-top">
                  <td className="px-2 py-1.5 font-medium">
                    {nomApplicationPromue(p.application_id, apps)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.score}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {p.note == null ? "—" : Math.round(p.note)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge variant={p.eligible ? "success" : "outline"} className="text-[10px]">
                      {p.eligible ? t("multiAppPosts.pertinences.oui") : t("multiAppPosts.pertinences.non")}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{p.raison ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DecksApplications({ contenuId }: { contenuId: string }) {
  const { t } = useTranslation();
  const applications = useApplicationsMulti();
  const decks = useQuery({
    queryKey: ["contenu-decks-applications", contenuId],
    queryFn: () => listerDecksApplicationsContenu(contenuId),
    retry: false,
  });
  const apps = applications.data ?? [];

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("multiAppPosts.decks.titre")}
      </h3>
      <p className="text-[11px] text-muted-foreground">{t("multiAppPosts.decks.aide")}</p>
      {decks.isPending ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : decks.isError ? (
        <p className="text-xs text-destructive">
          {t("multiAppPosts.decks.erreur", { message: messageErreur(decks.error) })}
        </p>
      ) : (decks.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("multiAppPosts.decks.vide")}</p>
      ) : (
        <ul className="space-y-2">
          {(decks.data ?? []).map((deck) => {
            const app = nomApplicationPromue(deck.application_id, apps);
            const slides = [...(deck.slides ?? [])].sort((a, b) => a.position - b.position);
            return (
              <li key={deck.id} className="space-y-1.5 rounded border p-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{app}</span>
                  <span className="text-muted-foreground">· {nomLangue(deck.langue)}</span>
                  <Badge
                    variant={
                      deck.statut === "pret"
                        ? "success"
                        : deck.statut === "echec"
                          ? "destructive"
                          : "outline"
                    }
                    className="text-[10px]"
                  >
                    {t(`multiAppPosts.decks.statut_${deck.statut}`)}
                  </Badge>
                  {/* Variante = slug de l'application ; seule une variante double (phase 2) se signale. */}
                  {deck.variante?.startsWith("dual:") && (
                    <span className="text-[10px] text-muted-foreground">{deck.variante}</span>
                  )}
                </div>
                {deck.raison && <p className="text-muted-foreground">{deck.raison}</p>}
                {slides.length > 0 && (
                  <ol className="space-y-1">
                    {slides.map((s) => (
                      <li key={s.position} className="flex items-start gap-1.5">
                        <span className="w-6 shrink-0 text-[10px] text-muted-foreground">
                          #{s.position}
                        </span>
                        <span className="min-w-0 flex-1 break-words">{s.texte_overlay ?? "—"}</span>
                        {s.position_sophia && (
                          <Badge variant="success" className="shrink-0 text-[10px]">
                            {t("multiAppPosts.appPromue", { app })}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Tier PAR APPLICATION (0270) d'un contenu, pour chaque application autre que
 * Sophia : rang, budget de passages et cycle PROPRES à l'application, sur ses
 * seuls passages. Le bloc Tierlist de la fiche reste celui de Sophia.
 *
 * Ne rend RIEN pendant le chargement, sur un schéma absent (0270 pas encore
 * passée) ni pour un contenu qui n'est noté pour aucune autre application —
 * la fiche d'un contenu Sophia est donc strictement celle d'avant. Une autre
 * erreur reste locale au bloc, comme pour les pertinences.
 */
export function TiersApplications({
  contenuId,
  tierlist,
}: {
  contenuId: string;
  /** Réglages `reglages.tierlist` (recul, délai plafond), lus par la fiche. */
  tierlist?: Pick<ReglagesTierlist, "recul_jours" | "requalif_max_jours">;
}) {
  const { t } = useTranslation();
  const applications = useApplicationsMulti();
  const etats = useQuery({
    queryKey: ["contenu-tiers-applications", contenuId],
    queryFn: () => listerTiersApplicationsContenu(contenuId),
    retry: false,
  });
  if (etats.isPending) return null;
  if (etats.isError) {
    if (estErreurSchemaAbsent(etats.error)) return null;
    return (
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("multiAppPosts.tiers.titre")}
        </h3>
        <p className="text-xs text-destructive">
          {t("multiAppPosts.tiers.erreur", { message: messageErreur(etats.error) })}
        </p>
      </section>
    );
  }
  const lignes = (etats.data ?? []).filter((e) => e.application_id !== ID_SOPHIA);
  if (lignes.length === 0) return null;
  const apps = applications.data ?? [];

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("multiAppPosts.tiers.titre")}
      </h3>
      <p className="text-[11px] text-muted-foreground">{t("multiAppPosts.tiers.aide")}</p>
      <ul className="space-y-2">
        {lignes.map((e) => (
          <LigneTierApplication
            key={e.application_id}
            contenuId={contenuId}
            etat={e}
            nom={nomApplicationPromue(e.application_id, apps)}
            tierlist={tierlist}
          />
        ))}
      </ul>
    </section>
  );
}

function LigneTierApplication({
  contenuId,
  etat: e,
  nom,
  tierlist,
}: {
  contenuId: string;
  etat: ContenuTierEtatApplication;
  nom: string;
  tierlist?: Pick<ReglagesTierlist, "recul_jours" | "requalif_max_jours">;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const rafraichir = () =>
    qc.invalidateQueries({ queryKey: ["contenu-tiers-applications", contenuId] });
  const changerTier = useMutation({
    mutationFn: (tier: Tier) => majTierContenuApplication(contenuId, e.application_id, tier),
    onSettled: rafraichir,
  });
  const requalifier = useMutation({
    mutationFn: () => relancerRequalifContenuApplication(contenuId, e.application_id),
    onSuccess: rafraichir,
  });
  const etat = etatRequalifCycle(e, tierlist);
  const erreur = changerTier.error ?? requalifier.error;

  return (
    <li className="space-y-1.5 rounded border p-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{nom}</span>
        <Badge variant="outline" className="text-[10px] font-bold">
          {e.tier}
        </Badge>
        <span className="tabular-nums text-muted-foreground">
          {t("slideshows.passagesDetail", {
            publies: e.publies ?? 0,
            prevus: e.passages_prevus ?? 0,
            envol: e.en_vol ?? 0,
          })}
        </span>
      </div>
      <p className="tabular-nums text-muted-foreground">
        {t("slideshows.moyenneVues")} :{" "}
        {e.moyenne_vues != null ? Math.round(e.moyenne_vues).toLocaleString() : "—"}
        {" · "}
        {t("slideshows.meilleurPassage")} :{" "}
        {e.max_vues != null ? e.max_vues.toLocaleString() : "—"}
      </p>
      {!e.materialise && (
        <p className="text-muted-foreground">
          {t("multiAppPosts.tiers.paresseux", {
            note: e.note == null ? "—" : Math.round(e.note),
          })}
        </p>
      )}
      {!e.eligible && (
        <p className="text-amber-700 dark:text-amber-400">{t("multiAppPosts.tiers.horsReserve")}</p>
      )}
      {etat && (
        <p className={cn(etat.alerte && "text-amber-700 dark:text-amber-400")}>
          {t(`slideshows.requalif.${etat.cle}`, {
            mesures: e.mesures ?? 0,
            publies: e.publies ?? 0,
            introuvables: e.introuvables ?? 0,
            attente: e.en_attente_mesure ?? 0,
            jours: tierlist?.requalif_max_jours ?? 3,
          })}
          {etat.echeance ? ` ${t("slideshows.requalifEcheance", { date: etat.echeance })}` : null}
        </p>
      )}
      {e.tier_rapport?.regle ? (
        <p className="text-muted-foreground">
          {t("slideshows.derniereRequalif", {
            avant: e.tier_rapport.avant ?? "—",
            apres: e.tier_rapport.apres ?? e.tier,
            regle: e.tier_rapport.regle,
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            disabled={changerTier.isPending}
            onClick={() => changerTier.mutate(tier)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-bold disabled:opacity-50",
              e.tier === tier ? "bg-muted" : "bg-background text-muted-foreground hover:bg-muted",
            )}
            title={t("slideshows.tierPassages", { count: PASSAGES_PAR_TIER[tier] })}
          >
            {tier}
          </button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px]"
          disabled={requalifier.isPending}
          onClick={() => requalifier.mutate()}
        >
          {requalifier.isPending ? t("common.loading") : t("slideshows.requalifMaintenant")}
        </Button>
      </div>
      {erreur ? <p className="text-destructive">{messageErreur(erreur)}</p> : null}
    </li>
  );
}
