import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { LabelEditor } from "@/features/moteur/LabelPicker";
import {
  creerSource,
  labelsDeLaSource,
  listerLabels,
  listerSources,
  majSource,
  setLabelsSource,
  stockParSource,
  supprimerSource,
} from "@/features/moteur/api";
import { demarrerImportCompte, demarrerImportLien } from "@/features/moteur/importJobs";
import { ImportHistoriquePanel } from "@/features/moteur/ImportHistoriquePanel";
import { ImportJobsPanel } from "@/features/moteur/ImportJobsPanel";
import type { CompteReference, Label as NicheLabel } from "@/features/moteur/types";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function NicheSelect({
  id,
  niches,
  value,
  onChange,
  allowEmpty = false,
}: {
  id: string;
  niches: NicheLabel[];
  value: string;
  onChange: (labelId: string) => void;
  allowEmpty?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <select
      id={id}
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={!allowEmpty}
    >
      <option value="">{t("sources.nicheChoisir")}</option>
      {niches.map((n) => (
        <option key={n.id} value={n.id}>
          {n.nom}
        </option>
      ))}
    </select>
  );
}

/**
 * Prompt adapté à une source : la voix / le ton que la traduction doit prendre
 * pour cette niche. C'est ici qu'il se règle (pas sur le compte du poster) —
 * c'est la source qui dicte le registre. Injecté à la traduction de ses sujets.
 */
function VoixSource({ source }: { source: CompteReference }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [texte, setTexte] = React.useState(source.style_profile ?? "");
  const modifie = texte !== (source.style_profile ?? "");

  const enregistrer = useMutation({
    mutationFn: () => majSource(source.id, { style_profile: texte.trim() || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
  });

  return (
    <div className="space-y-2 border-t pt-3">
      <Label htmlFor={`voix-${source.id}`} className="text-xs">
        {t("sources.voix")}
      </Label>
      <Textarea
        id={`voix-${source.id}`}
        rows={2}
        className="text-xs"
        placeholder={t("sources.voixPlaceholder")}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">{t("sources.voixAide")}</p>
      {modifie && (
        <Button size="sm" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {enregistrer.isPending ? t("common.saving") : t("common.save")}
        </Button>
      )}
    </div>
  );
}

/** Scrape + pipeline v-next en arrière-plan (ne bloque pas la page). */
function BoutonExtraire({ sourceId, handle }: { sourceId: string; handle: string }) {
  const { t } = useTranslation();
  const [resultat, setResultat] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        title={t("sources.extraireAide")}
        onClick={() => {
          demarrerImportCompte({ compteReferenceId: sourceId, handle });
          setResultat(t("sources.importJobLance"));
        }}
      >
        {t("sources.extraire")}
      </Button>
      {resultat && <span className="text-xs text-muted-foreground">{resultat}</span>}
    </div>
  );
}

/** Import v-next d'un seul TikTok rattaché à cette source (+ ses labels). */
function ImportLienSource({ sourceId }: { sourceId: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = React.useState("");
  const [ouvert, setOuvert] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const lancer = async () => {
    const lien = url.trim();
    if (!lien) {
      setMessage(t("sources.importLienRequis"));
      return;
    }
    try {
      const labelIds = await labelsDeLaSource(sourceId);
      demarrerImportLien({
        url: lien,
        compteReferenceId: sourceId,
        labelIds,
        titre: lien,
      });
      setMessage(t("sources.importJobLance"));
      setUrl("");
      setOuvert(false);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  if (!ouvert) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
        {t("sources.importLien")}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed p-2.5">
      <p className="text-xs font-medium">{t("sources.importLien")}</p>
      <p className="text-[11px] text-muted-foreground">{t("sources.importLienAide")}</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lancer();
        }}
      >
        <Input
          type="url"
          required
          placeholder="https://www.tiktok.com/@…/photo/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-[16rem] flex-1 text-xs"
        />
        <Button type="submit" size="sm" disabled={!url.trim()}>
          {t("sources.importLienGo")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOuvert(false);
            setMessage(null);
          }}
        >
          {t("common.cancel")}
        </Button>
      </form>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

/** Une ligne source (principal OU conjoint). Le conjoint est compact : pas de
 *  toggle genre (hérité du principal) ni de prompt de voix. */
function LigneSource({
  source,
  estConjoint = false,
}: {
  source: CompteReference;
  estConjoint?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["sources"] });
  const basculer = useMutation({
    mutationFn: () => majSource(source.id, { is_active: !source.is_active }),
    onSuccess: rafraichir,
  });
  const changerGenre = useMutation({
    mutationFn: (g: "homme" | "femme") => majSource(source.id, { genre: g }),
    onSuccess: rafraichir,
  });
  const retirer = useMutation({
    mutationFn: () => supprimerSource(source.id),
    onSuccess: rafraichir,
  });

  const lien = `https://www.tiktok.com/@${source.handle_tiktok.replace(/^@/, "")}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <a href={lien} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
              @{source.handle_tiktok} ↗
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(lien)}
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              {t("sources.copierLien")}
            </button>
            {estConjoint && <Badge variant="outline">{t("sources.conjoint")}</Badge>}
            {!source.is_active && <Badge variant="secondary">{t("sources.inactive")}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {[
              source.niche,
              source.dernier_scrape_at
                ? t("sources.extraitLe", {
                    date: new Date(source.dernier_scrape_at).toLocaleDateString(i18n.language),
                  })
                : t("sources.jamais"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {!estConjoint && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs text-muted-foreground">{t("sources.genre")}</span>
              <div className="inline-flex overflow-hidden rounded-md border">
                {(["femme", "homme"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    disabled={changerGenre.isPending}
                    onClick={() => changerGenre.mutate(g)}
                    className={
                      source.genre === g
                        ? "bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                        : "bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                    }
                  >
                    {g === "femme" ? t("sources.genreFemme") : t("sources.genreHomme")}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2">
          <BoutonExtraire sourceId={source.id} handle={source.handle_tiktok} />
          <Button size="sm" variant="outline" onClick={() => basculer.mutate()}>
            {source.is_active ? t("sources.deactivate") : t("sources.activate")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (window.confirm(t("sources.confirmDelete"))) retirer.mutate();
            }}
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>

      <ImportLienSource sourceId={source.id} />

      <div className="border-t pt-3">
        <LabelEditor
          queryKey={["source-labels", source.id]}
          load={() => labelsDeLaSource(source.id)}
          save={async (ids) => {
            // RPC : écrit les labels source + sync tous les slideshows + images.
            await setLabelsSource(source.id, ids);
          }}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t("labels.retroactif")}</p>
      </div>
      {!estConjoint && <VoixSource source={source} />}
    </div>
  );
}

const SEUIL_STOCK = 10;

function GroupeSource({
  primary,
  conjoints,
  stock,
  niches,
}: {
  primary: CompteReference;
  conjoints: CompteReference[];
  stock: number;
  niches: NicheLabel[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [handle, setHandle] = React.useState("");
  const [nicheId, setNicheId] = React.useState("");

  const ajouter = useMutation({
    mutationFn: async () => {
      const niche = niches.find((n) => n.id === nicheId);
      const cree = await creerSource({
        handle,
        niche: niche?.nom ?? primary.niche ?? "",
        langue: primary.langue,
        genre: primary.genre,
        parent_id: primary.id,
      });
      const labels = nicheId
        ? [nicheId]
        : await labelsDeLaSource(primary.id);
      if (labels.length > 0) await setLabelsSource(cree.id, labels);
      return cree;
    },
    onSuccess: () => {
      setHandle("");
      setNicheId("");
      setOuvert(false);
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const epuise = stock === 0;
  const faible = stock < SEUIL_STOCK;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={epuise ? "destructive" : faible ? "warning" : "success"}>
          {t("sources.stock", { count: stock })}
        </Badge>
        {faible && (
          <span className={epuise ? "text-xs text-destructive" : "text-xs text-warning"}>
            {epuise ? t("sources.epuise") : t("sources.stockFaible")}
          </span>
        )}
      </div>

      <LigneSource source={primary} />

      {conjoints.length > 0 && (
        <div className="space-y-3 border-l-2 border-muted pl-3">
          {conjoints.map((c) => (
            <LigneSource key={c.id} source={c} estConjoint />
          ))}
        </div>
      )}

      {ouvert ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (handle.trim()) ajouter.mutate();
          }}
          className="flex flex-wrap items-end gap-2 border-l-2 border-dashed border-muted pl-3"
        >
          <Input
            placeholder="@compte_conjoint"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="w-48"
            required
          />
          <div className="w-48">
            <NicheSelect
              id={`niche-conjoint-${primary.id}`}
              niches={niches}
              value={nicheId}
              onChange={setNicheId}
              allowEmpty
            />
          </div>
          <Button type="submit" size="sm" disabled={ajouter.isPending}>
            {ajouter.isPending ? t("common.saving") : t("sources.ajouterConjoint")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
            {t("common.cancel")}
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
          + {t("sources.ajouterConjoint")}
        </Button>
      )}
    </div>
  );
}

/** Formulaire d'ajout : soit un compte TikTok, soit un lien TikTok isolé. */
function FormAjoutSource({ niches }: { niches: NicheLabel[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<"compte" | "lien">("compte");
  const [handle, setHandle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [nicheId, setNicheId] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const nicheNom = niches.find((n) => n.id === nicheId)?.nom ?? "";

  const ajouter = useMutation({
    mutationFn: async () => {
      if (!nicheId) throw new Error(t("sources.nicheRequis"));

      if (mode === "compte") {
        if (!handle.trim()) throw new Error(t("sources.handleRequis"));
        const cree = await creerSource({
          handle,
          niche: nicheNom,
          langue: "fr",
        });
        await setLabelsSource(cree.id, [nicheId]);
        // Scrape + pipeline en arrière-plan — la page reste utilisable.
        demarrerImportCompte({
          compteReferenceId: cree.id,
          handle: cree.handle_tiktok,
        });
        return { kind: "compte" as const, handle: cree.handle_tiktok };
      }

      const lien = url.trim();
      if (!lien) throw new Error(t("sources.importLienRequis"));
      demarrerImportLien({
        url: lien,
        compteReferenceId: null,
        labelIds: [nicheId],
        titre: lien,
      });
      return { kind: "lien" as const };
    },
    onSuccess: (r) => {
      if (r.kind === "compte") {
        setMessage(t("sources.compteAjouteJob", { handle: r.handle }));
        setHandle("");
      } else {
        setMessage(t("sources.importJobLance"));
        setUrl("");
      }
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: ["slideshows"] });
      queryClient.invalidateQueries({ queryKey: ["contenus"] });
    },
    onError: (e) => setMessage((e as Error).message),
  });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="inline-flex overflow-hidden rounded-md border">
        {([
          ["compte", t("sources.modeCompte")],
          ["lien", t("sources.modeLien")],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setMessage(null);
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-medium",
              mode === id
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === "compte" ? t("sources.modeCompteAide") : t("sources.modeLienAide")}
      </p>

      {niches.length === 0 ? (
        <p className="text-sm text-warning">
          {t("sources.nicheAucune")}{" "}
          <Link to="/admin" className="underline underline-offset-2">
            {t("sources.creerNiche")}
          </Link>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ajouter.mutate();
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          {mode === "compte" ? (
            <div className="space-y-2">
              <Label htmlFor="handle">{t("sources.handle")}</Label>
              <Input
                id="handle"
                required
                placeholder="@mon_compte"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                disabled={ajouter.isPending}
              />
            </div>
          ) : (
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="tiktok-url">{t("sources.lienTikTok")}</Label>
              <Input
                id="tiktok-url"
                type="url"
                required
                placeholder="https://www.tiktok.com/@…/photo/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={ajouter.isPending}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="niche-ajout">{t("sources.niche")}</Label>
            <NicheSelect
              id="niche-ajout"
              niches={niches}
              value={nicheId}
              onChange={setNicheId}
            />
          </div>

          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={ajouter.isPending || !nicheId}>
              {ajouter.isPending
                ? mode === "lien"
                  ? t("sources.importLienEnCours")
                  : t("common.saving")
                : mode === "lien"
                  ? t("sources.importLienGo")
                  : t("sources.add")}
            </Button>
          </div>
        </form>
      )}

      {message && (
        <p
          className={
            ajouter.isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}

export function AdminSourcesPage() {
  const { t } = useTranslation();
  const sources = useQuery({ queryKey: ["sources"], queryFn: listerSources });
  const stock = useQuery({ queryKey: ["stock-sources"], queryFn: stockParSource });
  const niches = useQuery({ queryKey: ["labels"], queryFn: listerLabels });

  const toutes = sources.data ?? [];
  const principaux = toutes.filter((s) => !s.parent_id);
  const conjointsDe = (id: string) => toutes.filter((s) => s.parent_id === id);
  const stockGroupe = (p: CompteReference) => {
    const st = stock.data ?? {};
    return (st[p.id] ?? 0) + conjointsDe(p.id).reduce((n, c) => n + (st[c.id] ?? 0), 0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sources.title")}</CardTitle>
        <CardDescription>{t("sources.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FormAjoutSource niches={niches.data ?? []} />
        <ImportJobsPanel />
        <ImportHistoriquePanel />

        <div className="space-y-3">
          {sources.isPending && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {!sources.isPending && principaux.length === 0 && (
            <EmptyState title={t("sources.empty")} />
          )}

          {principaux.map((p) => (
            <GroupeSource
              key={p.id}
              primary={p}
              conjoints={conjointsDe(p.id)}
              stock={stockGroupe(p)}
              niches={niches.data ?? []}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
