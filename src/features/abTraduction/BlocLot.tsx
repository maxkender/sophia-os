import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { formaterNombre, messageErreur } from "@/features/bleo/format";

import {
  cleLot,
  CLE_REQUETE_LOTS,
  composerLot,
  couvertureLot,
  etatLot,
  listerCircuits,
  listerLots,
  type LotResume,
  reglerEnvoiAutoLot,
  servirLot,
  TAILLE_LOT,
} from "./api";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const NOUVEAU = "nouveau";

/**
 * Le lot commun (0627) : 15 slideshows choisis pour couvrir les labels, les
 * mêmes pour toutes les langues, préparés en duels par le serveur pour chaque
 * langue qui a un relecteur, contre le circuit candidat du lot. Depuis 0629 un
 * lot peut attendre l'envoi par l'admin (`envoi_auto` à faux). Ici : choisir le
 * lot, en composer un nouveau avec son candidat, voir sa composition et
 * l'avancement par langue.
 */
export function BlocLot({
  numero,
  onNumero,
  onChange,
}: {
  /** Le lot affiché ; sans valeur, le dernier lot composé. */
  numero?: number;
  onNumero?: (numero: number) => void;
  onChange?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const lots = useQuery({ queryKey: CLE_REQUETE_LOTS, queryFn: listerLots });
  const circuits = useQuery({ queryKey: ["ab-traduction", "circuits"], queryFn: listerCircuits });
  const dernier = (lots.data ?? []).reduce((max, l) => Math.max(max, l.numero), 0);
  const [choixLocal, setChoixLocal] = React.useState<number | typeof NOUVEAU | null>(null);
  const choix: number | typeof NOUVEAU = numero ?? choixLocal ?? (dernier > 0 ? dernier : NOUVEAU);
  const actif = choix === NOUVEAU ? null : choix;
  const lot = useQuery({ queryKey: cleLot(actif ?? 0), queryFn: () => etatLot(actif ?? 0), enabled: actif != null });
  const [resultat, setResultat] = React.useState<string | null>(null);
  const [candidatNouveau, setCandidatNouveau] = React.useState<string>("");
  const [envoiAutoNouveau, setEnvoiAutoNouveau] = React.useState(false);
  const circuitNouveau = candidatNouveau || circuits.data?.[circuits.data.length - 1]?.id || "ancree";

  const choisir = (valeur: number | typeof NOUVEAU) => {
    setChoixLocal(valeur);
    if (valeur !== NOUVEAU) onNumero?.(valeur);
  };
  const rafraichir = (n?: number) => {
    void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_LOTS });
    void queryClient.invalidateQueries({ queryKey: cleLot(n ?? actif ?? 0) });
    onChange?.();
  };
  const composer = useMutation({
    mutationFn: async () => {
      if (actif != null) return composerLot(actif, TAILLE_LOT, lot.data?.lot.candidat ?? circuitNouveau);
      const n = dernier + 1;
      const etat = await composerLot(n, TAILLE_LOT, circuitNouveau);
      if (!envoiAutoNouveau) await reglerEnvoiAutoLot(n, false);
      return etat;
    },
    onSuccess: (etat) => {
      const n = etat?.lot.numero ?? actif ?? dernier + 1;
      choisir(n);
      rafraichir(n);
    },
  });
  const envoiAuto = useMutation({
    mutationFn: (valeur: boolean) => reglerEnvoiAutoLot(actif!, valeur),
    onSuccess: () => rafraichir(),
  });
  const servir = useMutation({
    mutationFn: servirLot,
    onSuccess: (r) => {
      const ok = r.faits.filter((f) => f.ok).length;
      const rates = r.faits.filter((f) => !f.ok);
      setResultat(
        t("abTraduction.lot.tourFait", { ok, rates: rates.length, restants: r.restants }) +
          (rates.length ? ` ${rates.map((f) => `${f.langue} : ${f.raison ?? "?"}`).join(" · ")}` : "") +
          (r.sans_circuit.length ? ` ${t("abTraduction.lot.sansCircuit", { candidats: r.sans_circuit.join(", ") })}` : ""),
      );
      rafraichir();
    },
  });

  const etat = actif != null ? (lot.data ?? null) : null;
  const taille = etat?.lot.taille ?? TAILLE_LOT;
  const erreur = lots.error ?? lot.error ?? composer.error ?? servir.error ?? envoiAuto.error;
  const nomCircuit = (id: string) => circuits.data?.find((c) => c.id === id)?.nom ?? id;
  const libelleLot = (l: LotResume) =>
    t("abTraduction.lot.lotOption", { numero: l.numero, candidat: l.candidat, envoi: t(l.envoi_auto ? "abTraduction.lot.envoiAutoCourt" : "abTraduction.lot.envoiManuelCourt") });

  return (
    <div className="space-y-3 rounded-md border p-3 text-sm" data-testid="ab-lot">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Layers className="size-4 text-muted-foreground" aria-hidden />
          {etat ? t("abTraduction.lot.titre", { numero: etat.lot.numero, n: etat.contenus.length }) : t("abTraduction.lot.titreVide", { n: TAILLE_LOT })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(lots.data?.length ?? 0) > 0 && (
            <select
              aria-label={t("abTraduction.lot.selecteur")}
              className={selectClass}
              value={String(choix)}
              onChange={(e) => choisir(e.target.value === NOUVEAU ? NOUVEAU : Number(e.target.value))}
            >
              {(lots.data ?? []).map((l) => (
                <option key={l.numero} value={l.numero}>
                  {libelleLot(l)}
                </option>
              ))}
              <option value={NOUVEAU}>{t("abTraduction.lot.nouveau", { numero: dernier + 1 })}</option>
            </select>
          )}
          {etat && etat.duels === 0 && (
            <Button size="sm" variant="outline" disabled={composer.isPending} onClick={() => composer.mutate()}>
              {composer.isPending ? t("common.loading") : t("abTraduction.lot.recomposer")}
            </Button>
          )}
          {etat && (
            <Button size="sm" disabled={servir.isPending} onClick={() => servir.mutate()}>
              {servir.isPending ? t("abTraduction.lot.tourEnCours") : t("abTraduction.lot.tour")}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("abTraduction.lot.aide")}</p>

      {choix === NOUVEAU && (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/30 p-3" data-testid="ab-lot-nouveau">
          <div className="space-y-1">
            <Label htmlFor="abLotCandidat">{t("abTraduction.lot.candidatChoix")}</Label>
            <select id="abLotCandidat" className={selectClass} value={circuitNouveau} onChange={(e) => setCandidatNouveau(e.target.value)}>
              {(circuits.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.version})
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={envoiAutoNouveau} onChange={(e) => setEnvoiAutoNouveau(e.target.checked)} />
            {t("abTraduction.lot.envoiAuto")}
          </label>
          <Button size="sm" disabled={composer.isPending || !circuits.data?.length} onClick={() => composer.mutate()}>
            {composer.isPending ? t("common.loading") : t("abTraduction.lot.composerNumero", { numero: dernier + 1, n: TAILLE_LOT })}
          </Button>
        </div>
      )}

      {erreur && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
      {resultat && <p className="text-xs">{resultat}</p>}

      {etat && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {couvertureLot(etat.contenus).map((c) => (
              <Badge key={c.label} variant="outline">
                {c.label} · {c.n}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground">{t("abTraduction.lot.candidat", { candidat: nomCircuit(etat.lot.candidat) })}</span>
            <label className="ml-auto flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={etat.lot.envoi_auto !== false}
                disabled={envoiAuto.isPending}
                onChange={(e) => envoiAuto.mutate(e.target.checked)}
              />
              {etat.lot.envoi_auto === false ? t("abTraduction.lot.envoiManuel") : t("abTraduction.lot.envoiAuto")}
            </label>
          </div>

          <details>
            <summary className="cursor-pointer text-xs font-medium">{t("abTraduction.lot.contenus", { n: etat.contenus.length })}</summary>
            <ol className="mt-2 space-y-1 text-xs">
              {etat.contenus.map((c) => (
                <li key={c.contenu_id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-muted-foreground">{c.position}.</span>
                  <Badge variant="secondary">{c.label ?? "—"}</Badge>
                  <span className="min-w-0 flex-1 truncate">{c.accroche || c.titre || c.contenu_id}</span>
                  <span className="text-muted-foreground">
                    {t("abTraduction.lot.mesure", { langues: c.nb_langues ?? 0, r: formaterNombre(c.r_med, 2), publies: c.publies ?? 0 })}
                  </span>
                </li>
              ))}
            </ol>
          </details>

          {etat.langues.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("abTraduction.lot.aucuneLangue")}</p>
          ) : (
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              {etat.langues.map((l) => {
                const attendus = l.attendus ?? taille;
                const complet = l.prets + l.echecs >= attendus;
                return (
                  <li key={l.langue} className="flex flex-wrap items-center gap-2 rounded border px-2 py-1">
                    <span>
                      {drapeauLangue(l.langue)} {nomLangue(l.langue)}
                    </span>
                    <Badge variant={complet ? "success" : l.prets > 0 ? "info" : "outline"}>
                      {t("abTraduction.lot.avancement", { prets: l.prets, taille: attendus })}
                    </Badge>
                    {l.envoyes != null && l.envoyes < l.prets && (
                      <Badge variant="warning">{t("abTraduction.lot.nonEnvoyes", { n: l.prets - l.envoyes })}</Badge>
                    )}
                    <span className="text-muted-foreground">
                      {t("abTraduction.lot.langueDetail", { relecteurs: l.relecteurs, votes: l.votes, echecs: l.echecs })}
                      {l.dernier && ` · ${new Date(l.dernier).toLocaleTimeString(i18n.language.startsWith("en") ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
