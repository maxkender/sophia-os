import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { messageErreur } from "@/lib/utils";
import { listerDecksApplicationsContenu, listerPertinencesContenu } from "../apiMultiApp";
import { nomLangue } from "../langues";
import { nomApplicationPromue } from "./logique";
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
