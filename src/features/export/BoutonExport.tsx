import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ClipboardCopy, Download, FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { BarreChargement } from "@/components/ui/progress";
import { lireBonusAVenir } from "@/features/bonus/api";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { lireEtapesComptes } from "@/features/moteur/etapesApi";
import { lirePaie, lireSemaineSuivante } from "@/features/paie/api";
import { semaineAPayer } from "@/features/paie/logique";
import { telechargerCsv, versCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

import { journaliserExport, lireDonneesExport } from "./api";
import { texteClaude } from "./claude";
import { colonnesDuNiveau, PRESETS, type Niveau } from "./colonnes";
import {
  BLOCS,
  bornesPeriode,
  filtrerBloc,
  garderColonnes,
  lignesDetail,
  lignesResume,
  MAX_LIGNES_CLAUDE,
  nomFichier,
  PERIODES,
  type Bloc,
  type ContexteExport,
  type PeriodeExport,
} from "./construire";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// Le contexte de « Copier pour Claude » est en anglais, comme les colonnes.
const BLOC_EN: Record<Bloc, string> = {
  cette_semaine: "this week (first posting week)",
  semaine_prochaine: "next week (warm-up)",
  anciens: "former creators",
  paie: "pay",
  tout: "all",
};
const PERIODE_EN: Record<PeriodeExport, string> = {
  cette_semaine: "this week",
  semaine_derniere: "last week",
  "14j": "last 14 days",
  "30j": "last 30 days",
};

function Choix<T extends string>({
  libelle,
  valeur,
  options,
  onChange,
  texte,
}: {
  libelle: string;
  valeur: T;
  options: readonly T[];
  onChange: (v: T) => void;
  texte: (v: T) => string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="block text-xs font-medium text-muted-foreground">{libelle}</span>
      <select className={selectClass} value={valeur} onChange={(e) => onChange(e.target.value as T)} aria-label={libelle}>
        {options.map((o) => (
          <option key={o} value={o}>
            {texte(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Le bouton « Exporter » du dashboard HM (et de l'admin → Vue HM) : blocs,
 * période, niveau, colonnes, puis un CSV ou un texte « Copier pour Claude ».
 * Les données viennent de la base avec le cloisonnement du dashboard (0375) ;
 * chaque export est journalisé. `hm` : la HM choisie par l'admin ou le Head
 * of Ops ("" = toutes) ; une HM n'exporte que ses posteurs.
 */
export function BoutonExport({ hm = "" }: { hm?: string }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const [ouvert, setOuvert] = React.useState(false);
  const [bloc, setBloc] = React.useState<Bloc>("tout");
  const [periode, setPeriode] = React.useState<PeriodeExport>("cette_semaine");
  const [niveau, setNiveau] = React.useState<Niveau>("resume");
  const [colonnes, setColonnes] = React.useState<string[]>(PRESETS.suivi);
  const [message, setMessage] = React.useState<string | null>(null);
  const aujourdhui = aujourdhuiParis();
  const { debut, fin } = bornesPeriode(periode, aujourdhui);

  const donnees = useQuery({
    queryKey: ["export-hm", hm, debut, fin],
    enabled: ouvert,
    queryFn: async () => {
      const semaine = semaineAPayer(aujourdhui);
      const [comptes, etapes, paie, suivante, bonus] = await Promise.all([
        lireDonneesExport(debut, fin, hm || null),
        lireEtapesComptes().catch(() => new Map()),
        lirePaie(semaine).catch(() => []),
        lireSemaineSuivante(semaine).catch(() => new Map()),
        lireBonusAVenir().catch(() => []),
      ]);
      return { comptes, etapes, paie, suivante, bonus, semaine };
    },
  });

  const choisirNiveau = (n: Niveau) => {
    setNiveau(n);
    setColonnes(n === "resume" ? PRESETS.suivi : colonnesDuNiveau("detail"));
  };

  const resultat = React.useMemo(() => {
    if (!donnees.data) return null;
    const d = donnees.data;
    const ctx: ContexteExport = {
      aujourdhui,
      maintenant: new Date(),
      t,
      langue,
      etapes: d.etapes,
      paie: new Map(d.paie.filter((l) => !hm || l.poster?.manager_id === hm).map((l) => [l.poster_id, l])),
      semainePayee: d.semaine,
      suivante: d.suivante,
      bonus: d.bonus.filter((b) => !hm || b.hm_id === hm),
    };
    const comptes = filtrerBloc(d.comptes, bloc, ctx);
    const ordre = colonnesDuNiveau(niveau).filter((c) => colonnes.includes(c));
    const lignes =
      niveau === "resume"
        ? garderColonnes(lignesResume(comptes, debut, fin, ctx), ordre as (keyof ReturnType<typeof lignesResume>[number])[])
        : garderColonnes(lignesDetail(comptes, debut, fin, aujourdhui), ordre as (keyof ReturnType<typeof lignesDetail>[number])[]);
    // Une seule HM (la sienne, ou celle choisie) : son prénom ; sinon « toutes ».
    const parHm = new Map(d.comptes.filter((c) => !hm || c.hm_id === hm).map((c) => [c.hm_id, c]));
    const seule = parHm.size === 1 ? [...parHm.values()][0]! : null;
    return { lignes, ordre, prenom: seule?.hm_prenom ?? t("export.toutes"), zone: seule?.hm_zone ?? null };
  }, [donnees.data, bloc, niveau, colonnes, debut, fin, aujourdhui, t, langue, hm]);

  const journal = (format: "csv" | "claude") =>
    resultat &&
    journaliserExport({
      hm: hm || null,
      bloc,
      periode,
      niveau,
      colonnes: resultat.ordre,
      lignes: resultat.lignes.length,
      format,
    }).catch(() => undefined);

  const telecharger = () => {
    if (!resultat) return;
    telechargerCsv(nomFichier(resultat.prenom, bloc, aujourdhui), versCsv(resultat.ordre, resultat.lignes));
    void journal("csv");
    setMessage(t("export.telecharge"));
  };

  const copier = async () => {
    if (!resultat) return;
    const texte = texteClaude(
      {
        hm: resultat.prenom,
        zone: resultat.zone,
        debut,
        fin,
        periode: PERIODE_EN[periode],
        bloc: BLOC_EN[bloc],
        niveau,
        exporteLe: new Date(),
      },
      resultat.ordre,
      resultat.lignes,
    );
    if (texte === null) {
      setMessage(t("export.trop", { max: MAX_LIGNES_CLAUDE }));
      return;
    }
    await navigator.clipboard.writeText(texte);
    void journal("claude");
    setMessage(t("export.copie"));
  };

  const trop = (resultat?.lignes.length ?? 0) > MAX_LIGNES_CLAUDE;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <FileDown />
        {t("export.bouton")}
      </Button>
      <Dialog
        open={ouvert}
        onOpenChange={(o) => {
          setOuvert(o);
          if (!o) setMessage(null);
        }}
      >
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{t("export.titre")}</DialogTitle>
            <DialogDescription>{t("export.desc")}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4 pb-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Choix libelle={t("export.bloc")} valeur={bloc} options={BLOCS} onChange={setBloc} texte={(b) => t(`export.blocs.${b}`)} />
              <Choix
                libelle={t("export.periode")}
                valeur={periode}
                options={PERIODES}
                onChange={setPeriode}
                texte={(p) => t(`export.periodes.${p}`)}
              />
              <Choix
                libelle={t("export.niveau")}
                valeur={niveau}
                options={["resume", "detail"] as const}
                onChange={choisirNiveau}
                texte={(n) => t(`export.niveaux.${n}`)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t("export.preset")}</span>
                {niveau === "resume" &&
                  (["suivi", "paie", "tout"] as const).map((p) => (
                    <Button
                      key={p}
                      type="button"
                      size="sm"
                      variant={colonnes.join() === PRESETS[p].join() ? "default" : "outline"}
                      className="h-7"
                      onClick={() => setColonnes(PRESETS[p])}
                    >
                      {t(`export.presets.${p}`)}
                    </Button>
                  ))}
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("export.colonnesCochees", { n: colonnes.length })}
                </span>
              </div>
              <div className="grid max-h-48 grid-cols-1 gap-x-3 gap-y-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2 md:grid-cols-3">
                {colonnesDuNiveau(niveau).map((c) => (
                  <label key={c} className="flex items-center gap-1.5 font-mono text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--color-primary)]"
                      checked={colonnes.includes(c)}
                      onChange={(e) =>
                        setColonnes(e.target.checked ? [...colonnes, c] : colonnes.filter((x) => x !== c))
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>

            {donnees.isLoading && <BarreChargement actif />}
            {donnees.error && <p className="text-sm text-destructive">{(donnees.error as Error).message}</p>}
            {resultat && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm tabular-nums" data-testid="export-lignes">
                  {t("export.lignes", { count: resultat.lignes.length })} · {debut} → {fin}
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={colonnes.length === 0} onClick={telecharger}>
                    <Download />
                    {t("export.csv")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={colonnes.length === 0 || trop}
                    onClick={() => void copier()}
                  >
                    <ClipboardCopy />
                    {t("export.claude")}
                  </Button>
                </div>
              </div>
            )}
            {(message || trop) && (
              <p className={cn("text-sm", trop ? "text-warning-foreground" : "text-success-foreground")}>
                {trop ? t("export.trop", { max: MAX_LIGNES_CLAUDE }) : message}
              </p>
            )}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
