import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  RotateCw,
  Tag,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardPanel, EmptyState } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { Textarea } from "@/components/ui/textarea";
import { listerLabels } from "@/features/moteur/api";
import { drapeauLangue, LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

import {
  ajouterExemplesNatifs,
  lireExempleNatif,
  listerExemplesNatifs,
  majLabelExemple,
  supprimerExempleNatif,
  type ExempleNatif,
  type ResumeAjoutExemples,
  type StatutExempleNatif,
} from "./api";
import { CLASSES_TON, type Ton } from "./apparence";
import { messageErreur } from "./messageErreur";
import { MiniBarre, Puce, TuileIcone } from "./Puces";

export const CLE_REQUETE_EXEMPLES = ["exemples-natifs"] as const;
/** Une vingtaine d'exemples par langue, tous labels confondus. */
export const OBJECTIF_EXEMPLES = 20;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const STATUT: Record<StatutExempleNatif, { icone: LucideIcon; ton: Ton }> = {
  pret: { icone: CheckCircle2, ton: "vert" },
  en_attente: { icone: Clock, ton: "ambre" },
  erreur: { icone: AlertCircle, ton: "orange" },
};

/**
 * La banque d'exemples natifs d'une langue : une vingtaine de slideshows de
 * vrais créateurs, tous labels confondus, que la traduction ancrée lit en
 * entier. L'admin colle des liens ou des comptes ; l'OS récupère les slides
 * et en lit le texte, un slideshow après l'autre.
 */
export function SectionExemplesNatifs() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const exemples = useQuery({ queryKey: CLE_REQUETE_EXEMPLES, queryFn: listerExemplesNatifs });
  const labels = useQuery({ queryKey: ["labels"], queryFn: () => listerLabels() });

  const [langue, setLangue] = React.useState("de");
  const [texte, setTexte] = React.useState("");
  const [labelId, setLabelId] = React.useState("");
  const [lecture, setLecture] = React.useState<{ fait: number; total: number } | null>(null);
  const [erreurLecture, setErreurLecture] = React.useState<string | null>(null);

  const rafraichir = () => void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_EXEMPLES });

  // Un slideshow à la fois : chaque lecture tient dans une fonction Edge.
  const lire = async (ids: string[]) => {
    if (!ids.length || lecture) return;
    setErreurLecture(null);
    setLecture({ fait: 0, total: ids.length });
    for (const [i, id] of ids.entries()) {
      try {
        await lireExempleNatif(id);
      } catch (erreur) {
        setErreurLecture(messageErreur(erreur));
      }
      setLecture({ fait: i + 1, total: ids.length });
      rafraichir();
    }
    setLecture(null);
  };

  const ajouter = useMutation({
    mutationFn: () => ajouterExemplesNatifs(langue, labelId || null, texte),
    onSuccess: async () => {
      setTexte("");
      await queryClient.invalidateQueries({ queryKey: CLE_REQUETE_EXEMPLES });
      const tous = queryClient.getQueryData<ExempleNatif[]>(CLE_REQUETE_EXEMPLES) ?? [];
      void lire(tous.filter((e) => e.langue === langue && e.statut === "en_attente").map((e) => e.id));
    },
  });
  const changerLabel = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string | null }) => majLabelExemple(id, label),
    onSuccess: rafraichir,
  });
  const supprimer = useMutation({ mutationFn: supprimerExempleNatif, onSuccess: rafraichir });

  const tous = exemples.data ?? [];
  const siens = tous.filter((e) => e.langue === langue);
  const prets = siens.filter((e) => e.statut === "pret");
  const enAttente = siens.filter((e) => e.statut === "en_attente");
  const parLangue = (code: string) => tous.filter((e) => e.langue === code && e.statut === "pret").length;
  const nomLabel = new Map((labels.data ?? []).map((l) => [l.id, l.nom]));
  const couverture = (labels.data ?? []).map((l) => ({
    id: l.id,
    nom: l.nom,
    n: prets.filter((e) => e.label_id === l.id).length,
  }));
  const sansLabel = prets.filter((e) => !e.label_id || !nomLabel.has(e.label_id)).length;

  const erreur = exemples.error ?? labels.error;

  return (
    <div className="space-y-4" data-testid="exemples-natifs">
      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}

      <Card>
        <CardPanel className="space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <TuileIcone icone={BookOpenText} ton="violet" />
            <div className="min-w-[14rem] flex-1 space-y-1">
              <h2 className="text-base font-semibold">{t("relectureNative.exemples.titre")}</h2>
              <p className="text-sm text-muted-foreground">{t("relectureNative.exemples.aide")}</p>
            </div>
            <label className="flex w-full flex-col gap-1 text-xs sm:w-64">
              <span className="text-muted-foreground">{t("relectureNative.exemples.langue")}</span>
              <select className={selectClass} value={langue} onChange={(e) => setLangue(e.target.value)}>
                {LANGUES_CIBLES.map((l) => (
                  <option key={l} value={l}>
                    {drapeauLangue(l)} {nomLangue(l)}
                    {parLangue(l) ? ` · ${parLangue(l)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium">
                {t("relectureNative.exemples.avancement", { n: prets.length, objectif: OBJECTIF_EXEMPLES })}
              </span>
              <span className="text-muted-foreground">{t("relectureNative.exemples.seuil")}</span>
            </div>
            <MiniBarre valeur={prets.length} total={OBJECTIF_EXEMPLES} />
          </div>

          <div className="space-y-2">
            <p className={MICRO_LABEL}>{t("relectureNative.exemples.couverture")}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label={t("relectureNative.exemples.couverture")}>
              {couverture.map((c) => (
                <li key={c.id}>
                  <Puce icone={Tag} ton={c.n > 0 ? "vert" : "neutre"} className={cn(c.n === 0 && "border-dashed")}>
                    {c.nom} · {c.n}
                  </Puce>
                </li>
              ))}
              {sansLabel > 0 && (
                <li>
                  <Puce icone={Tag}>
                    {t("relectureNative.exemples.sansLabel")} · {sansLabel}
                  </Puce>
                </li>
              )}
            </ul>
          </div>
        </CardPanel>
      </Card>

      <Card>
        <CardPanel className="space-y-3">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (texte.trim()) ajouter.mutate();
            }}
          >
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("relectureNative.exemples.coller")}</span>
              <span className="block text-xs text-muted-foreground">{t("relectureNative.exemples.collerAide")}</span>
              <Textarea
                rows={5}
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                placeholder={"https://www.tiktok.com/@compte/photo/7380000000000000000\n@compte"}
                className="font-mono text-xs"
              />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs sm:max-w-xs">
                <span className="text-muted-foreground">{t("relectureNative.exemples.label")}</span>
                <select className={selectClass} value={labelId} onChange={(e) => setLabelId(e.target.value)}>
                  <option value="">{t("relectureNative.exemples.sansLabel")}</option>
                  {(labels.data ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={!texte.trim() || ajouter.isPending || Boolean(lecture)}>
                {ajouter.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                {t("relectureNative.exemples.ajouter")}
              </Button>
            </div>
          </form>
          {ajouter.error && (
            <p role="alert" className="text-xs text-destructive">
              {messageErreur(ajouter.error)}
            </p>
          )}
          {ajouter.data && <ResumeAjout resume={ajouter.data} />}
          {lecture && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="lecture-exemples">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("relectureNative.exemples.lecture", { fait: lecture.fait, total: lecture.total })}
            </p>
          )}
          {!lecture && enAttente.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void lire(enAttente.map((e) => e.id))}>
              <RotateCw />
              {t("relectureNative.exemples.lireAttente", { count: enAttente.length })}
            </Button>
          )}
          {erreurLecture && (
            <p role="alert" className="text-xs text-destructive">
              {erreurLecture}
            </p>
          )}
        </CardPanel>
      </Card>

      {exemples.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : siens.length === 0 ? (
        <EmptyState title={t("relectureNative.exemples.vide", { langue: nomLangue(langue) })} />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {siens.map((e) => (
              <LigneExemple
                key={e.id}
                exemple={e}
                labels={labels.data ?? []}
                occupe={Boolean(lecture)}
                onLabel={(label) => changerLabel.mutate({ id: e.id, label })}
                onRelire={() => void lire([e.id])}
                onSupprimer={() => supprimer.mutate(e.id)}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ResumeAjout({ resume }: { resume: ResumeAjoutExemples }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-xs" data-testid="resume-ajout">
      <p className="font-medium">{t("relectureNative.exemples.ajoutes", { n: resume.ajoutes, deja: resume.deja })}</p>
      {resume.comptes.map((c) => (
        <p key={c.pseudo} className={cn(c.erreur && "text-destructive")}>
          @{c.pseudo} :{" "}
          {c.erreur
            ? c.erreur
            : c.slideshows > 0
              ? t("relectureNative.exemples.compteSlideshows", { n: c.slideshows })
              : t("relectureNative.exemples.compteSans")}
        </p>
      ))}
      {resume.ignorees.length > 0 && (
        <p className="text-muted-foreground">
          {t("relectureNative.exemples.ignorees")} {resume.ignorees.join(" · ")}
        </p>
      )}
    </div>
  );
}

function LigneExemple({
  exemple: e,
  labels,
  occupe,
  onLabel,
  onRelire,
  onSupprimer,
}: {
  exemple: ExempleNatif;
  labels: ReadonlyArray<{ id: string; nom: string }>;
  occupe: boolean;
  onLabel: (labelId: string | null) => void;
  onRelire: () => void;
  onSupprimer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  const { icone: Icone, ton } = STATUT[e.statut];
  const slides = [...e.slides].sort((a, b) => a.position - b.position);
  const accroche = slides[0]?.texte.split("\n")[0] ?? "";

  return (
    <li className="space-y-3 px-5 py-3" data-testid={`exemple-${e.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", CLASSES_TON[ton])}>
              <Icone className="size-3.5" aria-hidden />
              {t(`relectureNative.exemples.statuts.${e.statut}`)}
            </span>
            <a
              href={e.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
            >
              @{e.handle ?? "?"}
              <ExternalLink className="size-3" aria-hidden />
            </a>
            {e.statut === "pret" && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("relectureNative.exemples.slides", { n: slides.length })}
                {e.vues ? ` · ${t("relectureNative.exemples.vues", { n: e.vues.toLocaleString(i18n.language) })}` : ""}
              </span>
            )}
          </div>
          {e.statut === "pret" && <p className="truncate text-sm font-medium" dir="auto">{accroche}</p>}
          {e.statut === "erreur" && <p className="text-xs text-destructive">{e.erreur}</p>}
        </div>
        <select
          className="h-8 w-40 rounded-md border border-input bg-background px-2 text-xs"
          aria-label={t("relectureNative.exemples.labelExemple", { handle: e.handle ?? "?" })}
          value={e.label_id ?? ""}
          onChange={(ev) => onLabel(ev.target.value || null)}
        >
          <option value="">{t("relectureNative.exemples.sansLabel")}</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {e.statut === "pret" && (
            <Button variant="ghost" size="sm" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}>
              {ouvert ? <ChevronUp /> : <ChevronDown />}
              {t("relectureNative.exemples.texte")}
            </Button>
          )}
          {e.statut !== "pret" && (
            <Button variant="ghost" size="sm" disabled={occupe} onClick={onRelire}>
              <RotateCw />
              {t("relectureNative.exemples.relire")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={t("relectureNative.exemples.supprimer")}
            title={t("relectureNative.exemples.supprimer")}
            onClick={onSupprimer}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {ouvert && (
        <ol className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-sm" dir="auto">
          {slides.map((s) => (
            <li key={s.position} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">{s.position}</span>
              <span className="whitespace-pre-wrap">{s.texte}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
