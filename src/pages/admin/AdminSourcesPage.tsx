import * as React from "react";
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
  importerContenuDepuisLien,
  labelsDeLaSource,
  lancerExtraction,
  lancerImportContenu,
  listerSources,
  majSource,
  propagerLabelsSource,
  setLabelsSource,
  stockParSource,
  supprimerSource,
} from "@/features/moteur/api";
import type { CompteReference } from "@/features/moteur/types";

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

function BoutonExtraire({ sourceId }: { sourceId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [resultat, setResultat] = React.useState<string | null>(null);

  const extraire = useMutation({
    mutationFn: () => lancerExtraction(sourceId),
    onSuccess: (r) => {
      setResultat(t("sujets.slides", { count: r.sujetsCrees }));
      queryClient.invalidateQueries();
    },
    onError: (e) => setResultat((e as Error).message),
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        title={t("sources.extraireAide")}
        disabled={extraire.isPending}
        onClick={() => extraire.mutate()}
      >
        {extraire.isPending ? t("sources.extraction") : t("sources.extraire")}
      </Button>
      {resultat && <span className="text-xs text-muted-foreground">{resultat}</span>}
    </div>
  );
}

/** Import v-next d'un seul TikTok rattaché à cette source (+ ses labels). */
function ImportLienSource({ sourceId }: { sourceId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = React.useState("");
  const [ouvert, setOuvert] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const importer = useMutation({
    mutationFn: async () => {
      const lien = url.trim();
      if (!lien) throw new Error(t("sources.importLienRequis"));
      const labelIds = await labelsDeLaSource(sourceId);
      const cree = await importerContenuDepuisLien(lien, sourceId, labelIds);
      // Avance encore quelques pas du pipeline (ELO → clean → trad…).
      if (cree.contenuId) {
        for (let i = 0; i < 8; i += 1) {
          const r = await lancerImportContenu(cree.contenuId).catch(() => null);
          if (!r || r.idle || r.etape === "done" || r.etape === "rejete" || r.etape === "elo_insuffisant") {
            break;
          }
        }
      }
      return cree;
    },
    onSuccess: (r) => {
      setMessage(
        r.reused
          ? t("sources.importLienDeja")
          : t("sources.importLienOk", { etape: r.etape ?? "…" }),
      );
      setUrl("");
      queryClient.invalidateQueries({ queryKey: ["slideshows"] });
      queryClient.invalidateQueries({ queryKey: ["contenus"] });
    },
    onError: (e) => setMessage((e as Error).message),
  });

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
          importer.mutate();
        }}
      >
        <Input
          type="url"
          required
          placeholder="https://www.tiktok.com/@…/photo/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-[16rem] flex-1 text-xs"
          disabled={importer.isPending}
        />
        <Button type="submit" size="sm" disabled={importer.isPending || !url.trim()}>
          {importer.isPending ? t("sources.importLienEnCours") : t("sources.importLienGo")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={importer.isPending}
          onClick={() => {
            setOuvert(false);
            setMessage(null);
          }}
        >
          {t("common.cancel")}
        </Button>
      </form>
      {message && (
        <p
          className={
            importer.isError ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {message}
        </p>
      )}
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

          {/* Genre : sur le principal seulement (le groupe partage le même genre). */}
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
          <BoutonExtraire sourceId={source.id} />
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
            await setLabelsSource(source.id, ids);
            await propagerLabelsSource(source.id);
          }}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t("labels.retroactif")}</p>
      </div>
      {!estConjoint && <VoixSource source={source} />}
    </div>
  );
}

/** En dessous de ce stock (slideshows reproductibles du groupe), on invite à
 *  ajouter un compte conjoint. */
const SEUIL_STOCK = 10;

/** Un groupe = un compte principal + ses conjoints (matière élargie), avec le
 *  stock du groupe et le formulaire d'ajout d'un conjoint. */
function GroupeSource({
  primary,
  conjoints,
  stock,
}: {
  primary: CompteReference;
  conjoints: CompteReference[];
  stock: number;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [handle, setHandle] = React.useState("");
  const [niche, setNiche] = React.useState("");

  const ajouter = useMutation({
    mutationFn: () =>
      creerSource({
        handle,
        niche,
        // Un conjoint hérite langue + genre de son principal (source « similaire »).
        langue: primary.langue,
        genre: primary.genre,
        parent_id: primary.id,
      }),
    onSuccess: () => {
      setHandle("");
      setNiche("");
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
          className="flex flex-wrap items-center gap-2 border-l-2 border-dashed border-muted pl-3"
        >
          <Input
            placeholder="@compte_conjoint"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="w-48"
          />
          <Input
            placeholder={t("sources.niche")}
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="w-48"
          />
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

export function AdminSourcesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const sources = useQuery({ queryKey: ["sources"], queryFn: listerSources });
  const stock = useQuery({ queryKey: ["stock-sources"], queryFn: stockParSource });

  const [handle, setHandle] = React.useState("");
  const [niche, setNiche] = React.useState("");

  const ajouter = useMutation({
    mutationFn: () => creerSource({ handle, niche, langue: "fr" }),
    onSuccess: () => {
      setHandle("");
      setNiche("");
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });

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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (handle.trim()) ajouter.mutate();
          }}
          className="grid gap-4 sm:grid-cols-3"
        >
          <div className="space-y-2">
            <Label htmlFor="handle">{t("sources.handle")}</Label>
            <Input
              id="handle"
              required
              placeholder="@mon_compte"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="niche">{t("sources.niche")}</Label>
            <Input id="niche" value={niche} onChange={(e) => setNiche(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={ajouter.isPending}>
              {ajouter.isPending ? t("common.saving") : t("sources.add")}
            </Button>
          </div>
          {ajouter.isError && (
            <p className="text-sm text-destructive sm:col-span-3">
              {(ajouter.error as Error).message}
            </p>
          )}
        </form>

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
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
