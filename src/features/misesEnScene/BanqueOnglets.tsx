// Onglets Captures, Intégrateurs et Mises en scène de la Bibliothèque (0344).
// Une capture : un vrai écran d'appli, par application et par support.
// Un intégrateur : une photo de la bibliothèque choisie pour un support.
// Une mise en scène : une capture validée posée dans l'écran d'un intégrateur
// validé du même support (Nano Banana Pro). Seul un humain valide ; seules
// les validées servent aux podz. Phase test : en français seulement.

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Languages, Plus, RotateCcw, Upload, Wand2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import {
  ajouterIntegrateur,
  APPLICATIONS_BANQUE,
  chercherScenes,
  couplesManquants,
  deciderBanque,
  grouperVersions,
  ECRANS_CONNUS,
  importerCapture,
  lireBudgetFal,
  listerCaptures,
  listerIntegrateurs,
  listerMisesEnScene,
  mettreEnScene,
  SUPPORTS,
  traduireCapture,
  traduireMiseEnScene,
  versionsManquantes,
  type CaptureApp,
  type CarteVersions,
  type EtapeTraduction,
  type FiltresBanque,
  type Integrateur,
  type MiseEnScene,
  type StatutBanque,
  type Support,
} from "./api";

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const VARIANTE_STATUT: Record<StatutBanque, "warning" | "success" | "error"> = {
  a_valider: "warning",
  validee: "success",
  rejetee: "error",
};

function invaliderBanque(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["banque-captures"] });
  void queryClient.invalidateQueries({ queryKey: ["banque-integrateurs"] });
  void queryClient.invalidateQueries({ queryKey: ["banque-couples"] });
  void queryClient.invalidateQueries({ queryKey: ["banque-mises-en-scene"] });
  void queryClient.invalidateQueries({ queryKey: ["banque-budget-fal"] });
}

function BudgetFal() {
  const { t } = useTranslation();
  const budget = useQuery({ queryKey: ["banque-budget-fal"], queryFn: lireBudgetFal });
  if (!budget.data) return null;
  const b = budget.data;
  return (
    <span className={cn("text-xs", b.possible ? "text-muted-foreground" : "text-destructive")}>
      {t("misesEnScene.budget", {
        depense: b.depense_semaine.toFixed(2),
        budget: b.budget_semaine,
        prix: b.prix_image.toFixed(2),
      })}
    </span>
  );
}

function Filtres({
  valeur,
  onChange,
  avecEcran = true,
  avecLangue = true,
}: {
  valeur: FiltresBanque;
  onChange: (f: FiltresBanque) => void;
  avecEcran?: boolean;
  avecLangue?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <select
        aria-label={t("misesEnScene.application")}
        className={selectClass}
        value={valeur.application ?? ""}
        onChange={(e) => onChange({ ...valeur, application: e.target.value || undefined })}
      >
        <option value="">{t("misesEnScene.toutesApplications")}</option>
        {APPLICATIONS_BANQUE.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <select
        aria-label={t("misesEnScene.support")}
        className={selectClass}
        value={valeur.support ?? ""}
        onChange={(e) => onChange({ ...valeur, support: (e.target.value || undefined) as Support | undefined })}
      >
        <option value="">{t("misesEnScene.tousSupports")}</option>
        {SUPPORTS.map((x) => (
          <option key={x} value={x}>{t(`misesEnScene.supports.${x}`)}</option>
        ))}
      </select>
      {avecEcran && (
        <select
          aria-label={t("misesEnScene.ecran")}
          className={selectClass}
          value={valeur.ecran ?? ""}
          onChange={(e) => onChange({ ...valeur, ecran: e.target.value || undefined })}
        >
          <option value="">{t("misesEnScene.tousEcrans")}</option>
          {ECRANS_CONNUS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      )}
      {avecLangue && (
        <select
          aria-label={t("misesEnScene.langue")}
          className={selectClass}
          value={valeur.langue ?? ""}
          onChange={(e) => onChange({ ...valeur, langue: e.target.value || undefined })}
        >
          <option value="">{t("misesEnScene.toutesLangues")}</option>
          {LANGUES_CIBLES.map((l) => (
            <option key={l} value={l}>{nomLangue(l)}</option>
          ))}
        </select>
      )}
      <select
        aria-label={t("misesEnScene.statut")}
        className={selectClass}
        value={valeur.statut ?? ""}
        onChange={(e) => onChange({ ...valeur, statut: (e.target.value || undefined) as StatutBanque | undefined })}
      >
        <option value="">{t("misesEnScene.tousStatuts")}</option>
        {(["a_valider", "validee", "rejetee"] as const).map((s) => (
          <option key={s} value={s}>{t(`misesEnScene.statuts.${s}`)}</option>
        ))}
      </select>
    </div>
  );
}

/** Valider / rejeter (avec motif) : seul un humain décide. */
function Decision({
  objet,
  id,
  statut,
}: {
  objet: "capture" | "integrateur" | "mise_en_scene";
  id: string;
  statut: StatutBanque;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [motif, setMotif] = React.useState<string | null>(null);
  const decider = useMutation({
    mutationFn: (p: { statut: "validee" | "rejetee"; motif?: string }) => deciderBanque(objet, id, p.statut, p.motif),
    onSuccess: () => {
      setMotif(null);
      invaliderBanque(queryClient);
    },
  });
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {statut !== "validee" && (
          <Button size="sm" variant="outline" disabled={decider.isPending} onClick={() => decider.mutate({ statut: "validee" })}>
            <Check className="size-3.5" />
            {t("misesEnScene.valider")}
          </Button>
        )}
        {statut !== "rejetee" && motif === null && (
          <Button size="sm" variant="ghost" disabled={decider.isPending} onClick={() => setMotif("")}>
            <X className="size-3.5" />
            {t("misesEnScene.rejeter")}
          </Button>
        )}
      </div>
      {motif !== null && (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            decider.mutate({ statut: "rejetee", motif: motif.trim() || undefined });
          }}
        >
          <input
            autoFocus
            aria-label={t("misesEnScene.motif")}
            placeholder={t("misesEnScene.motif")}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
          <Button size="sm" type="submit" variant="destructive" disabled={decider.isPending}>
            {t("misesEnScene.rejeter")}
          </Button>
        </form>
      )}
      {decider.error && <p className="text-xs text-destructive">{(decider.error as Error).message}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Captures
// ---------------------------------------------------------------------------

function ImporterCapture({ captures }: { captures: CaptureApp[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [application, setApplication] = React.useState<string>("micabo");
  const [ecran, setEcran] = React.useState("parcours");
  const [support, setSupport] = React.useState<Support>("iphone");
  const [langue, setLangue] = React.useState("fr");
  const [fichier, setFichier] = React.useState<File | null>(null);
  const [remplace, setRemplace] = React.useState("");
  const remplacables = captures.filter(
    (c) =>
      c.nature === "originale" && !c.remplacee_par && c.statut !== "rejetee" && c.application === application &&
      c.ecran === ecran && c.support === support && c.langue === langue,
  );
  const importer = useMutation({
    mutationFn: () =>
      importerCapture({ application, ecran, support, langue, fichier: fichier as File, remplace_id: remplace || null }),
    onSuccess: () => {
      setFichier(null);
      setRemplace("");
      invaliderBanque(queryClient);
    },
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (fichier) importer.mutate();
      }}
    >
      <select aria-label={t("misesEnScene.application")} className={selectClass} value={application} onChange={(e) => setApplication(e.target.value)}>
        {APPLICATIONS_BANQUE.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <input
        aria-label={t("misesEnScene.ecran")}
        list="ecrans-connus"
        className="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs"
        value={ecran}
        onChange={(e) => setEcran(e.target.value.toLowerCase())}
      />
      <datalist id="ecrans-connus">
        {ECRANS_CONNUS.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <select aria-label={t("misesEnScene.support")} className={selectClass} value={support} onChange={(e) => setSupport(e.target.value as Support)}>
        {SUPPORTS.map((x) => (
          <option key={x} value={x}>{t(`misesEnScene.supports.${x}`)}</option>
        ))}
      </select>
      <select aria-label={t("misesEnScene.langue")} className={selectClass} value={langue} onChange={(e) => setLangue(e.target.value)}>
        {LANGUES_CIBLES.map((l) => (
          <option key={l} value={l}>{nomLangue(l)}</option>
        ))}
      </select>
      {remplacables.length > 0 && (
        <select aria-label={t("misesEnScene.remplace")} className={selectClass} value={remplace} onChange={(e) => setRemplace(e.target.value)}>
          <option value="">{t("misesEnScene.remplaceAucune")}</option>
          {remplacables.map((c) => (
            <option key={c.id} value={c.id}>{t("misesEnScene.remplaceCapture", { id: c.id.slice(0, 8) })}</option>
          ))}
        </select>
      )}
      <input
        aria-label={t("misesEnScene.fichier")}
        type="file"
        accept="image/png,image/jpeg"
        className="text-xs"
        onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
      />
      <Button size="sm" type="submit" disabled={!fichier || importer.isPending}>
        <Upload className="size-3.5" />
        {importer.isPending ? t("misesEnScene.envoi") : t("misesEnScene.importer")}
      </Button>
      {importer.error && <p className="w-full text-xs text-destructive">{(importer.error as Error).message}</p>}
    </form>
  );
}

/** « Traduire en… » sur une originale validée : la capture traduite (à plat) arrive à relire. */
function TraduireEn({ capture }: { capture: CaptureApp }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [langue, setLangue] = React.useState("");
  const traduire = useMutation({
    mutationFn: () => traduireCapture(capture.id, langue),
    onSuccess: () => {
      setLangue("");
      invaliderBanque(queryClient);
    },
  });
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <select
          aria-label={t("misesEnScene.traduireEn")}
          className={cn(selectClass, "min-w-0 flex-1")}
          value={langue}
          onChange={(e) => setLangue(e.target.value)}
        >
          <option value="">{t("misesEnScene.traduireEn")}</option>
          {LANGUES_CIBLES.filter((l) => l !== capture.langue).map((l) => (
            <option key={l} value={l}>{nomLangue(l)}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" disabled={!langue || traduire.isPending} onClick={() => traduire.mutate()}>
          <Languages className="size-3.5" />
          {traduire.isPending ? t("misesEnScene.enCours") : t("misesEnScene.traduire")}
        </Button>
      </div>
      {traduire.error && <p className="text-xs text-destructive">{(traduire.error as Error).message}</p>}
    </div>
  );
}

function CarteCapture({ capture }: { capture: CaptureApp }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <a href={capture.url} target="_blank" rel="noreferrer">
        <img
          src={capture.url}
          alt={`${capture.application ?? ""} ${capture.ecran} ${capture.langue}`}
          loading="lazy"
          className={cn("aspect-[3/4] w-full rounded-md border bg-muted object-contain", capture.remplacee_par && "opacity-50")}
        />
      </a>
      <div className="flex flex-wrap gap-1">
        <Badge variant={VARIANTE_STATUT[capture.statut]}>{t(`misesEnScene.statuts.${capture.statut}`)}</Badge>
        <Badge variant="outline">{capture.application}</Badge>
        <Badge variant="outline">{capture.ecran}</Badge>
        <Badge variant="outline">{capture.langue}</Badge>
        <Badge variant="outline">{t(`misesEnScene.supports.${capture.support}`)}</Badge>
        <Badge variant={capture.nature === "originale" ? "secondary" : "info"}>{t(`misesEnScene.natures.${capture.nature}`)}</Badge>
        {capture.remplacee_par && <Badge variant="warning">{t("misesEnScene.remplacee")}</Badge>}
      </div>
      {capture.motif_rejet && <p className="text-xs text-muted-foreground">{capture.motif_rejet}</p>}
      <Decision objet="capture" id={capture.id} statut={capture.statut} />
      {capture.nature === "originale" && capture.statut === "validee" && !capture.remplacee_par && (
        <TraduireEn capture={capture} />
      )}
    </div>
  );
}

export function CapturesOnglet() {
  const { t } = useTranslation();
  const [filtres, setFiltres] = React.useState<FiltresBanque>({});
  const captures = useQuery({ queryKey: ["banque-captures", filtres], queryFn: () => listerCaptures(filtres) });
  const toutes = useQuery({ queryKey: ["banque-captures", {}], queryFn: () => listerCaptures({}) });
  const liste = captures.data ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{t("misesEnScene.capturesTitre")}</CardTitle>
            <CardDescription>{t("misesEnScene.capturesAide")}</CardDescription>
          </div>
          <BudgetFal />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ImporterCapture captures={toutes.data ?? []} />
        <Filtres valeur={filtres} onChange={setFiltres} />
        {captures.error && <p className="text-sm text-destructive">{(captures.error as Error).message}</p>}
        {captures.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("misesEnScene.chargement")}</p>
        ) : liste.length === 0 ? (
          <EmptyState title={t("misesEnScene.capturesVide")} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {liste.map((c) => (
              <CarteCapture key={c.id} capture={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Mises en scène
// ---------------------------------------------------------------------------

/** Lance, couple par couple, les mises en scène qui manquent (une image Fal par appel). */
function GenererManquantes() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [application, setApplication] = React.useState<string>("micabo");
  const [support, setSupport] = React.useState<Support | "">("");
  const [nombre, setNombre] = React.useState(3);
  const [lot, setLot] = React.useState<{ fait: number; total: number } | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const couples = useQuery({
    queryKey: ["banque-couples", application, support],
    queryFn: () => couplesManquants(application, support || undefined),
  });
  const manquants = couples.data ?? [];

  async function generer() {
    const aFaire = manquants.slice(0, Math.max(1, nombre));
    setErreur(null);
    setLot({ fait: 0, total: aFaire.length });
    try {
      for (const [i, c] of aFaire.entries()) {
        await mettreEnScene(c);
        setLot({ fait: i + 1, total: aFaire.length });
        invaliderBanque(queryClient);
      }
    } catch (e) {
      // Budget atteint, couple déjà fait… : le lot s'arrête, le reste attend.
      setErreur((e as Error).message);
    } finally {
      setLot(null);
      invaliderBanque(queryClient);
    }
  }

  return (
    <div className="space-y-1 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t("misesEnScene.application")} className={selectClass} value={application} onChange={(e) => setApplication(e.target.value)}>
          {APPLICATIONS_BANQUE.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select aria-label={t("misesEnScene.support")} className={selectClass} value={support} onChange={(e) => setSupport(e.target.value as Support | "")}>
          <option value="">{t("misesEnScene.tousSupports")}</option>
          {SUPPORTS.map((x) => (
            <option key={x} value={x}>{t(`misesEnScene.supports.${x}`)}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{t("misesEnScene.nbManquantes", { count: manquants.length })}</span>
        <input
          aria-label={t("misesEnScene.combien")}
          type="number"
          min={1}
          max={50}
          className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs"
          value={nombre}
          onChange={(e) => setNombre(Number(e.target.value) || 1)}
        />
        <Button size="sm" disabled={!manquants.length || lot !== null} onClick={() => void generer()}>
          <Wand2 className="size-3.5" />
          {lot
            ? t("misesEnScene.lotEnCours", { fait: lot.fait, total: lot.total })
            : t("misesEnScene.generer", { count: Math.min(nombre, manquants.length) })}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("misesEnScene.genererAide")}</p>
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}

/** Lot de versions d'une langue : toutes les images validées dont la capture traduite est validée. */
function GenererVersions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [application, setApplication] = React.useState<string>("micabo");
  const [langue, setLangue] = React.useState("");
  const [lot, setLot] = React.useState<{ fait: number; total: number } | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const etat = useQuery({
    queryKey: ["banque-couples", "versions", application, langue],
    queryFn: () => versionsManquantes(application, langue),
    enabled: Boolean(langue),
  });
  const pretes = etat.data?.pretes ?? [];

  async function generer() {
    setErreur(null);
    setLot({ fait: 0, total: pretes.length });
    try {
      for (const [i, id] of pretes.entries()) {
        await traduireMiseEnScene(id, langue);
        setLot({ fait: i + 1, total: pretes.length });
        invaliderBanque(queryClient);
      }
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setLot(null);
      invaliderBanque(queryClient);
    }
  }

  return (
    <div className="space-y-1 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t("misesEnScene.application")} className={selectClass} value={application} onChange={(e) => setApplication(e.target.value)}>
          {APPLICATIONS_BANQUE.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select aria-label={t("misesEnScene.langueVersions")} className={selectClass} value={langue} onChange={(e) => setLangue(e.target.value)}>
          <option value="">{t("misesEnScene.langueVersions")}</option>
          {LANGUES_CIBLES.map((l) => (
            <option key={l} value={l}>{nomLangue(l)}</option>
          ))}
        </select>
        {etat.data && (
          <span className="text-xs text-muted-foreground">
            {t("misesEnScene.etatVersions", {
              pretes: pretes.length,
              traduire: etat.data.captures_a_traduire.length,
              valider: etat.data.captures_a_valider.length,
            })}
          </span>
        )}
        <Button size="sm" disabled={!pretes.length || lot !== null} onClick={() => void generer()}>
          <Languages className="size-3.5" />
          {lot
            ? t("misesEnScene.lotEnCours", { fait: lot.fait, total: lot.total })
            : t("misesEnScene.genererVersions", { count: pretes.length })}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("misesEnScene.genererVersionsAide")}</p>
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}

/** Relance (une seule) d'un essai raté : l'origine, ou la version d'une langue. */
function Relancer({ mise, origine }: { mise: MiseEnScene; origine: MiseEnScene }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const relancer = useMutation({
    mutationFn: async () => {
      if (mise.version_de) await traduireMiseEnScene(origine.id, mise.langue, mise.id);
      else await mettreEnScene({ capture_id: mise.capture_id, integrateur_id: mise.integrateur_id, relance_de: mise.id });
    },
    onSuccess: () => invaliderBanque(queryClient),
  });
  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" disabled={relancer.isPending} onClick={() => relancer.mutate()}>
        <RotateCcw className="size-3.5" />
        {relancer.isPending ? t("misesEnScene.enCours") : t("misesEnScene.relancer")}
      </Button>
      {relancer.error && <p className="text-xs text-destructive">{(relancer.error as Error).message}</p>}
    </div>
  );
}

/** « + langue » : traduit la capture à plat, puis (une fois validée) l'écran de la même image. */
function AjouterLangue({ carte }: { carte: CarteVersions }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [langue, setLangue] = React.useState("");
  const [etape, setEtape] = React.useState<EtapeTraduction | null>(null);
  const traduire = useMutation({
    mutationFn: () => traduireMiseEnScene(carte.origine.id, langue),
    onSuccess: (e) => {
      setEtape(e);
      invaliderBanque(queryClient);
    },
  });
  const libres = LANGUES_CIBLES.filter((l) => {
    const v = carte.versions[l];
    return !v || v.statut === "rejetee";
  });
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <select
          aria-label={t("misesEnScene.ajouterLangue")}
          className={cn(selectClass, "min-w-0 flex-1")}
          value={langue}
          onChange={(e) => {
            setLangue(e.target.value);
            setEtape(null);
          }}
        >
          <option value="">{t("misesEnScene.ajouterLangue")}</option>
          {libres.map((l) => (
            <option key={l} value={l}>{nomLangue(l)}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" disabled={!langue || traduire.isPending} onClick={() => traduire.mutate()}>
          <Plus className="size-3.5" />
          {traduire.isPending ? t("misesEnScene.enCours") : t("misesEnScene.traduire")}
        </Button>
      </div>
      {etape && <p className="text-xs text-muted-foreground">{t(`misesEnScene.etapes.${etape}`)}</p>}
      {traduire.error && <p className="text-xs text-destructive">{(traduire.error as Error).message}</p>}
    </div>
  );
}

/** Une photo × un écran ; les langues en sont des versions (pastilles). */
function CarteMiseEnScene({ carte }: { carte: CarteVersions }) {
  const { t } = useTranslation();
  const { origine } = carte;
  const [langue, setLangue] = React.useState(origine.langue);
  const mise = carte.versions[langue] ?? origine;
  const langues = [origine.langue, ...Object.keys(carte.versions).filter((l) => l !== origine.langue).sort()];
  return (
    <div className="space-y-1.5">
      <a href={mise.url} target="_blank" rel="noreferrer">
        <img
          src={mise.url}
          alt={`${mise.application ?? ""} ${mise.ecran} ${mise.langue}`}
          loading="lazy"
          className={cn("aspect-[3/4] w-full rounded-md border object-cover", mise.a_refaire && "opacity-50")}
        />
      </a>
      <div role="tablist" aria-label={t("misesEnScene.langue")} className="flex flex-wrap gap-1">
        {langues.map((l) => {
          const v = carte.versions[l];
          return (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={l === langue}
              onClick={() => setLangue(l)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs",
                l === langue ? "border-primary bg-primary text-primary-foreground" : "bg-background",
              )}
            >
              {l}
              {v.statut === "validee" ? " ✓" : v.statut === "rejetee" ? " ✗" : " …"}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge variant={VARIANTE_STATUT[mise.statut]}>{t(`misesEnScene.statuts.${mise.statut}`)}</Badge>
        {mise.a_refaire && <Badge variant="warning">{t("misesEnScene.aRefaire")}</Badge>}
        <Badge variant="outline">{mise.application}</Badge>
        <Badge variant="outline">{mise.ecran}</Badge>
        <Badge variant="outline">{t(`misesEnScene.supports.${mise.support}`)}</Badge>
        {mise.essai > 1 && <Badge variant="info">{t("misesEnScene.relance")}</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("misesEnScene.usage", { count: mise.used_count })} · {t("misesEnScene.scene", { id: mise.scene_id.slice(0, 8) })}
      </p>
      {mise.motif_rejet && <p className="text-xs text-muted-foreground">{mise.motif_rejet}</p>}
      <Decision objet="mise_en_scene" id={mise.id} statut={mise.statut} />
      {mise.essai < 2 && mise.statut === "a_valider" && !mise.a_refaire && <Relancer mise={mise} origine={origine} />}
      {origine.statut === "validee" && !origine.a_refaire ? (
        <AjouterLangue carte={carte} />
      ) : origine.statut === "a_valider" ? (
        <p className="text-xs text-muted-foreground">{t("misesEnScene.langueApresValidation")}</p>
      ) : null}
    </div>
  );
}

export function MisesEnSceneOnglet() {
  const { t } = useTranslation();
  const [filtres, setFiltres] = React.useState<FiltresBanque>({});
  // Le statut se lit sur l'image d'origine : toutes les versions viennent avec elle.
  const { statut, ...filtresServeur } = filtres;
  const mises = useQuery({
    queryKey: ["banque-mises-en-scene", filtresServeur],
    queryFn: () => listerMisesEnScene(filtresServeur),
  });
  const liste = mises.data ?? [];
  const cartes = grouperVersions(liste).filter((c) => !statut || c.origine.statut === statut);
  const aRefaire = cartes.filter((c) => c.origine.a_refaire && c.origine.statut !== "rejetee").length;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{t("misesEnScene.misesTitre")}</CardTitle>
            <CardDescription>
              {t("misesEnScene.misesAide")}
              {aRefaire > 0 ? ` · ${t("misesEnScene.nbARefaire", { count: aRefaire })}` : ""}
            </CardDescription>
          </div>
          <BudgetFal />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <GenererManquantes />
        <GenererVersions />
        <Filtres valeur={filtres} onChange={setFiltres} avecLangue={false} />
        {mises.error && <p className="text-sm text-destructive">{(mises.error as Error).message}</p>}
        {mises.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("misesEnScene.chargement")}</p>
        ) : cartes.length === 0 ? (
          <EmptyState title={t("misesEnScene.misesVide")} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {cartes.map((c) => (
              <CarteMiseEnScene key={c.origine.id} carte={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Intégrateurs
// ---------------------------------------------------------------------------

function ChoisirIntegrateur() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [cherche, setCherche] = React.useState("");
  const [support, setSupport] = React.useState<Support>("iphone");
  const [mediaId, setMediaId] = React.useState("");
  const [note, setNote] = React.useState("");
  const photos = useQuery({
    queryKey: ["banque-scenes", cherche],
    queryFn: () => chercherScenes(cherche),
    enabled: cherche.trim().length >= 3,
  });
  const ajouter = useMutation({
    mutationFn: () => ajouterIntegrateur(mediaId, support, note.trim() || undefined),
    onSuccess: () => {
      setMediaId("");
      setNote("");
      invaliderBanque(queryClient);
    },
  });
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-end gap-2">
        <input
          aria-label={t("misesEnScene.chercherScene")}
          placeholder={t("misesEnScene.chercherScene")}
          className="h-8 w-56 rounded-md border border-input bg-background px-2 text-xs"
          value={cherche}
          onChange={(e) => setCherche(e.target.value)}
        />
        <select aria-label={t("misesEnScene.support")} className={selectClass} value={support} onChange={(e) => setSupport(e.target.value as Support)}>
          {SUPPORTS.map((x) => (
            <option key={x} value={x}>{t(`misesEnScene.supports.${x}`)}</option>
          ))}
        </select>
        <input
          aria-label={t("misesEnScene.note")}
          placeholder={t("misesEnScene.note")}
          className="h-8 w-56 rounded-md border border-input bg-background px-2 text-xs"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" disabled={!mediaId || ajouter.isPending} onClick={() => ajouter.mutate()}>
          <Plus className="size-3.5" />
          {t("misesEnScene.ajouterIntegrateur")}
        </Button>
      </div>
      {(photos.data ?? []).length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {(photos.data ?? []).map((p) => (
            <button key={p.id} type="button" title={p.caption ?? p.id} aria-pressed={mediaId === p.id} onClick={() => setMediaId(p.id)}>
              <img
                src={p.url}
                alt={p.caption ?? ""}
                loading="lazy"
                className={cn("aspect-[3/4] w-full rounded border object-cover", mediaId === p.id && "ring-2 ring-primary")}
              />
            </button>
          ))}
        </div>
      )}
      {ajouter.error && <p className="text-xs text-destructive">{(ajouter.error as Error).message}</p>}
    </div>
  );
}

function CarteIntegrateur({ integrateur }: { integrateur: Integrateur }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      {integrateur.url && (
        <a href={integrateur.url} target="_blank" rel="noreferrer">
          <img
            src={integrateur.url}
            alt={integrateur.caption ?? integrateur.media_id}
            loading="lazy"
            className="aspect-[3/4] w-full rounded-md border object-cover"
          />
        </a>
      )}
      <div className="flex flex-wrap gap-1">
        <Badge variant={VARIANTE_STATUT[integrateur.statut]}>{t(`misesEnScene.statuts.${integrateur.statut}`)}</Badge>
        <Badge variant="outline">{t(`misesEnScene.supports.${integrateur.support}`)}</Badge>
      </div>
      {integrateur.note && <p className="text-xs text-muted-foreground">{integrateur.note}</p>}
      {integrateur.motif_rejet && <p className="text-xs text-muted-foreground">{integrateur.motif_rejet}</p>}
      <Decision objet="integrateur" id={integrateur.id} statut={integrateur.statut} />
    </div>
  );
}

export function IntegrateursOnglet() {
  const { t } = useTranslation();
  const [support, setSupport] = React.useState<Support | "">("");
  const integrateurs = useQuery({
    queryKey: ["banque-integrateurs", support],
    queryFn: () => listerIntegrateurs(support ? { support } : {}),
  });
  const liste = integrateurs.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("misesEnScene.integrateursTitre")}</CardTitle>
        <CardDescription>{t("misesEnScene.integrateursAide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChoisirIntegrateur />
        <select aria-label={t("misesEnScene.support")} className={selectClass} value={support} onChange={(e) => setSupport(e.target.value as Support | "")}>
          <option value="">{t("misesEnScene.tousSupports")}</option>
          {SUPPORTS.map((x) => (
            <option key={x} value={x}>{t(`misesEnScene.supports.${x}`)}</option>
          ))}
        </select>
        {integrateurs.error && <p className="text-sm text-destructive">{(integrateurs.error as Error).message}</p>}
        {integrateurs.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("misesEnScene.chargement")}</p>
        ) : liste.length === 0 ? (
          <EmptyState title={t("misesEnScene.integrateursVide")} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {liste.map((i) => (
              <CarteIntegrateur key={i.id} integrateur={i} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
