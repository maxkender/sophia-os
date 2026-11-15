import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { formaterNombre, messageErreur } from "@/features/bleo/format";

import { listerRelecteurs } from "./api";
import { envoyerRelectures, listerRelectures, type RelectureAdmin } from "./apiRelectures";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const N_PAR_ENVOI = 15;

export const CLE_RELECTURES = ["relectures-posts"] as const;

function dateCourte(iso: string | null, langue: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(langue.startsWith("en") ? "en-GB" : "fr-FR", { day: "numeric", month: "short" });
}

/**
 * Relecture native → Relectures (0631) : par langue, les posts publiés
 * envoyés aux relecteurs (le samedi, 15 par langue, ou tout de suite avec
 * le bouton), ce qu'ils en ont fait (note, slides réécrites, remarque), et
 * la part de slides reprises, qui doit baisser quand la boucle marche.
 */
export function SectionRelectures() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const relecteurs = useQuery({ queryKey: ["relecteurs-natifs"], queryFn: listerRelecteurs });
  const langues = React.useMemo(
    () => [...new Set((relecteurs.data ?? []).map((r) => r.langue.toLowerCase()))].sort(),
    [relecteurs.data],
  );
  const [langueChoisie, setLangueChoisie] = React.useState<string | null>(null);
  const langue = langueChoisie && langues.includes(langueChoisie) ? langueChoisie : (langues[0] ?? null);
  const relectures = useQuery({
    queryKey: [...CLE_RELECTURES, langue],
    queryFn: () => listerRelectures(langue!),
    enabled: Boolean(langue),
  });
  const [bilan, setBilan] = React.useState<string | null>(null);
  const envoyer = useMutation({
    mutationFn: () => envoyerRelectures(langue!, N_PAR_ENVOI),
    onSuccess: (n) => {
      setBilan(t("relectureNative.relecturesAdmin.envoyes", { n }));
      void qc.invalidateQueries({ queryKey: CLE_RELECTURES });
    },
  });
  const [ouvert, setOuvert] = React.useState<string | null>(null);

  const liste = relectures.data ?? [];
  const faites = liste.filter((r) => r.statut === "faite");
  const slidesTotal = faites.reduce((n, r) => n + r.slides.length, 0);
  const slidesReprises = faites.reduce((n, r) => n + r.slides_corrigees.length, 0);
  const noteMoyenne = faites.filter((r) => r.note != null).reduce((s, r) => s + (r.note ?? 0), 0) / Math.max(1, faites.filter((r) => r.note != null).length);
  const erreur = relecteurs.error ?? relectures.error ?? envoyer.error;

  return (
    <div className="space-y-4" data-testid="section-relectures">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{t("relectureNative.relecturesAdmin.titre")}</h2>
        <p className="text-xs text-muted-foreground">{t("relectureNative.relecturesAdmin.aide", { n: N_PAR_ENVOI })}</p>
      </div>
      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
      {relecteurs.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : langues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("relectureNative.relecturesAdmin.aucuneLangue")}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="relecturesLangue">{t("relectureNative.relecturesAdmin.langue")}</Label>
            <select id="relecturesLangue" className={selectClass} value={langue ?? ""} onChange={(e) => setLangueChoisie(e.target.value)}>
              {langues.map((l) => (
                <option key={l} value={l}>
                  {drapeauLangue(l)} {nomLangue(l)}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" disabled={envoyer.isPending || !langue} onClick={() => envoyer.mutate()}>
            <Send />
            {envoyer.isPending ? t("common.loading") : t("relectureNative.relecturesAdmin.envoyer", { n: N_PAR_ENVOI })}
          </Button>
          {bilan && <span className="text-xs">{bilan}</span>}
        </div>
      )}

      {langue && !relectures.isPending && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="relectures-bilan">
            <Badge variant="outline">{t("relectureNative.relecturesAdmin.envoyesTotal", { count: liste.length })}</Badge>
            <Badge variant={faites.length === liste.length && liste.length > 0 ? "success" : "info"}>
              {t("relectureNative.relecturesAdmin.faites", { count: faites.length })}
            </Badge>
            {faites.length > 0 && (
              <>
                <Badge variant="outline">{t("relectureNative.relecturesAdmin.noteMoyenne", { note: formaterNombre(noteMoyenne, 2) })}</Badge>
                <Badge variant={slidesTotal > 0 && slidesReprises / slidesTotal > 0.3 ? "warning" : "outline"}>
                  {t("relectureNative.relecturesAdmin.slidesReprises", {
                    reprises: slidesReprises,
                    total: slidesTotal,
                    pct: slidesTotal > 0 ? Math.round((slidesReprises / slidesTotal) * 100) : 0,
                  })}
                </Badge>
              </>
            )}
          </div>
          {liste.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("relectureNative.relecturesAdmin.aucune")}</p>
          ) : (
            <ul className="space-y-2" data-testid="liste-relectures">
              {liste.map((r) => (
                <LigneRelecture key={r.id} r={r} ouverte={ouvert === r.id} onOuvrir={() => setOuvert(ouvert === r.id ? null : r.id)} date={(iso) => dateCourte(iso, i18n.language)} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function LigneRelecture({ r, ouverte, onOuvrir, date }: { r: RelectureAdmin; ouverte: boolean; onOuvrir: () => void; date: (iso: string | null) => string }) {
  const { t } = useTranslation();
  const nomRelecteur = [r.relecteur?.prenom, r.relecteur?.nom].filter(Boolean).join(" ") || "?";
  const reecrites = new Map(r.slides_corrigees.map((s) => [s.position, s.texte]));
  const accroche = [...r.slides].sort((a, b) => a.position - b.position)[0]?.texte_overlay ?? "";
  return (
    <li className="rounded-md border p-3 text-sm" data-testid="relecture-admin" data-statut={r.statut}>
      <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={onOuvrir} aria-expanded={ouverte}>
        <Badge variant={r.statut === "faite" ? "success" : "outline"}>
          {t(`relectureNative.relecturesAdmin.statut.${r.statut}`)}
        </Badge>
        {r.label && <Badge variant="secondary">{r.label}</Badge>}
        <span className="min-w-0 flex-1 truncate">{accroche.split("\n")[0]}</span>
        {r.note != null && <span className="text-xs text-muted-foreground">{r.note}/5</span>}
        {r.statut === "faite" && (
          <span className="text-xs text-muted-foreground">{t("relectureNative.relecturesAdmin.reecrites", { count: r.slides_corrigees.length })}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {nomRelecteur} · {date(r.fait_le ?? r.envoye_le)}
          {r.vues != null && ` · ${formaterNombre(r.vues, 0)} ${t("relectureNative.relecturesAdmin.vues")}`}
        </span>
      </button>
      {ouverte && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {r.remarque && <p className="text-xs italic text-muted-foreground">« {r.remarque} »</p>}
          <ol className="space-y-1 text-xs">
            {[...r.slides]
              .sort((a, b) => a.position - b.position)
              .map((s) => (
                <li key={s.position} className="grid gap-x-3 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="text-muted-foreground">{s.position}</span>
                  <span className={reecrites.has(s.position) ? "line-through decoration-destructive/60" : ""}>{s.texte_overlay}</span>
                  <span className="font-medium">{reecrites.get(s.position) ?? ""}</span>
                </li>
              ))}
          </ol>
        </div>
      )}
    </li>
  );
}
