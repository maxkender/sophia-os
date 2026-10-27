import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle, EmptyState } from "@/components/ui/card";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";

import { listerEcrituresKit, listerKit, listerRelecteurs } from "./api";
import { accrochePost, avancementKit, postsDuRelecteur, texteEcrit } from "./kit";
import { messageErreur } from "./messageErreur";
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
  const posts = relecteur ? postsDuRelecteur(kit.data, relecteur.statut === "actif" ? "actif" : "invite") : [];
  const avancement = avancementKit(posts, [...siennes.values()]);

  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-xs">
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
        <p className="text-sm">
          {t("relectureNative.kit.avancement", { rendus: avancement.rendus, total: avancement.total })}
          {relecteur.statut !== "actif" && (
            <span className="text-muted-foreground"> · {t("relectureNative.ecrituresKit.testSeulement")}</span>
          )}
        </p>
      )}

      {posts.map((p) => {
        const e = siennes.get(p.id);
        return (
          <Card key={p.id} data-testid={`ecriture-kit-${p.rang}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                #{p.rang}
                {e?.rendu_at ? (
                  <Badge variant="success">
                    {t("relectureNative.ecrituresKit.renduLe", {
                      date: new Date(e.rendu_at).toLocaleDateString(i18n.language),
                    })}
                  </Badge>
                ) : e ? (
                  <Badge variant="warning">{t("relectureNative.kit.etats.en_cours")}</Badge>
                ) : (
                  <Badge variant="secondary">{t("relectureNative.kit.etats.a_faire")}</Badge>
                )}
              </CardTitle>
              <CardDescription>{accrochePost(p)}</CardDescription>
            </CardHeader>
            {e && (
              <CardPanel className="space-y-3">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="w-10 py-1 font-medium" />
                      <th className="py-1 pr-3 font-medium">{t("relectureNative.kit.anglais")}</th>
                      <th className="py-1 font-medium">{t("relectureNative.ecrituresKit.version")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...p.slides_en]
                      .sort((a, b) => a.position - b.position)
                      .map((s) => (
                        <tr
                          key={s.position}
                          className={p.voie !== "libre" && p.slide_cta === s.position ? "border-t bg-primary/5" : "border-t"}
                        >
                          <td className="py-2 align-top text-xs text-muted-foreground">{s.position}</td>
                          <td className="py-2 pr-3 align-top whitespace-pre-wrap text-muted-foreground">{s.texte}</td>
                          <td className="py-2 align-top whitespace-pre-wrap" dir="auto">
                            {texteEcrit(e.slides, s.position) || "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {e.remarque.trim() && (
                  <p className="text-sm">
                    <span className="font-medium">{t("relectureNative.ecrituresKit.remarque")} </span>
                    <span dir="auto" className="whitespace-pre-wrap">
                      {e.remarque}
                    </span>
                  </p>
                )}
              </CardPanel>
            )}
          </Card>
        );
      })}
    </div>
  );
}
