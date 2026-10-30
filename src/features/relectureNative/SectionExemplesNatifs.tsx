import * as React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
  effacerSuiviComptes,
  listerComptesNatifs,
  listerExemplesNatifs,
  majLabelExemple,
  relireExempleNatif,
  supprimerExempleNatif,
  type CompteNatif,
  type ExempleNatif,
  type StatutExempleNatif,
} from "./api";
import { CLASSES_TON, type Ton } from "./apparence";
import { messageErreur } from "./messageErreur";
import { MiniBarre, Puce, TuileIcone } from "./Puces";

export const CLE_REQUETE_EXEMPLES = ["exemples-natifs"] as const;
const CLE_REQUETE_COMPTES = ["exemples-natifs-comptes"] as const;
/** Une vingtaine d'exemples par langue, tous labels confondus. */
export const OBJECTIF_EXEMPLES = 20;
/** La traduction ancrée ne lit la banque d'une langue qu'à partir de ce nombre d'exemples prêts. */
export const SEUIL_BANQUE = 5;
/** Tant que le serveur travaille, la page relit l'avancement à ce rythme. */
const INTERVALLE_SUIVI_MS = 5000;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const STATUT: Record<StatutExempleNatif, { icone: LucideIcon; ton: Ton }> = {
  pret: { icone: CheckCircle2, ton: "vert" },
  en_attente: { icone: Clock, ton: "ambre" },
  erreur: { icone: AlertCircle, ton: "orange" },
};

/** Le serveur a-t-il encore des comptes à chercher ou des slideshows à lire ? */
function travailEnCours(queryClient: QueryClient): boolean {
  const exemples = queryClient.getQueryData<ExempleNatif[]>(CLE_REQUETE_EXEMPLES) ?? [];
  const comptes = queryClient.getQueryData<CompteNatif[]>(CLE_REQUETE_COMPTES) ?? [];
  return exemples.some((e) => e.statut === "en_attente") || comptes.some((c) => c.statut === "en_attente");
}

/**
 * La banque d'exemples natifs d'une langue : une vingtaine de slideshows de
 * vrais créateurs, tous labels confondus, que la traduction ancrée lit en
 * entier. L'admin colle des liens ou des comptes ; le serveur cherche les
 * comptes et lit les slides, chaque minute, page fermée ou non (0618). La page
 * ne fait que suivre l'avancement.
 */
export function SectionExemplesNatifs() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const suivre = () => (travailEnCours(queryClient) ? INTERVALLE_SUIVI_MS : false);
  const exemples = useQuery({ queryKey: CLE_REQUETE_EXEMPLES, queryFn: listerExemplesNatifs, refetchInterval: suivre });
  const comptes = useQuery({ queryKey: CLE_REQUETE_COMPTES, queryFn: listerComptesNatifs, refetchInterval: suivre });
  const labels = useQuery({ queryKey: ["labels"], queryFn: () => listerLabels() });

  const [langue, setLangue] = React.useState("de");
  const [texte, setTexte] = React.useState("");
  const [labelId, setLabelId] = React.useState("");
  const [envois, setEnvois] = React.useState(0);
  const [retours, setRetours] = React.useState<Retour[]>([]);

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_EXEMPLES });
    void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_COMPTES });
  };
  const noter = (ton: Retour["ton"], texteRetour: string) =>
    setRetours((avant) => [{ id: idRetour++, ton, texte: texteRetour }, ...avant].slice(0, 20));

  // Un envoi ne bloque rien et revient en une seconde : le serveur note les
  // comptes et les liens, puis cherche et lit tout seul.
  const envoyer = async () => {
    const colle = texte;
    const langueEnvoi = langue;
    const label = labelId || null;
    const nomLabelEnvoi = label ? (labels.data ?? []).find((l) => l.id === label)?.nom ?? "?" : t("relectureNative.exemples.sansLabel");
    setTexte("");
    setEnvois((n) => n + 1);
    try {
      const r = await ajouterExemplesNatifs(langueEnvoi, label, colle);
      noter(
        "ok",
        t("relectureNative.exemples.retour.envoi", {
          label: nomLabelEnvoi,
          langue: nomLangue(langueEnvoi),
          comptes: r.comptes,
          liens: r.ajoutes,
        }),
      );
      if (r.deja + r.dejaEnFile > 0) noter("info", t("relectureNative.exemples.retour.deja", { n: r.deja + r.dejaEnFile }));
      if (r.ignorees.length > 0) {
        noter("erreur", t("relectureNative.exemples.retour.ignorees", { lignes: r.ignorees.join(" · ") }));
      }
    } catch (erreur) {
      noter("erreur", messageErreur(erreur));
    } finally {
      setEnvois((n) => n - 1);
      rafraichir();
    }
  };

  const changerLabel = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string | null }) => majLabelExemple(id, label),
    onSuccess: rafraichir,
  });
  const supprimer = useMutation({ mutationFn: supprimerExempleNatif, onSuccess: rafraichir });
  const relire = useMutation({ mutationFn: (id: string) => relireExempleNatif(id), onSettled: rafraichir });
  const effacerSuivi = useMutation({ mutationFn: (code: string) => effacerSuiviComptes(code), onSuccess: rafraichir });

  const tous = exemples.data ?? [];
  const siens = tous.filter((e) => e.langue === langue);
  const prets = siens.filter((e) => e.statut === "pret");
  const aLire = siens.filter((e) => e.statut === "en_attente").length;
  const comptesLangue = (comptes.data ?? []).filter((c) => c.langue === langue);
  const aChercher = comptesLangue.filter((c) => c.statut === "en_attente").length;
  const parLangue = (code: string) => tous.filter((e) => e.langue === code && e.statut === "pret").length;
  const nomLabel = new Map((labels.data ?? []).map((l) => [l.id, l.nom]));
  const couverture = (labels.data ?? []).map((l) => ({
    id: l.id,
    nom: l.nom,
    n: prets.filter((e) => e.label_id === l.id).length,
  }));
  const sansLabel = prets.filter((e) => !e.label_id || !nomLabel.has(e.label_id)).length;

  const erreur = exemples.error ?? comptes.error ?? labels.error ?? relire.error ?? effacerSuivi.error;

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
        <CardPanel className="space-y-4">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (texte.trim()) void envoyer();
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
              <Button type="submit" disabled={!texte.trim()}>
                {envois > 0 ? <Loader2 className="animate-spin" /> : <Plus />}
                {t("relectureNative.exemples.ajouter")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("relectureNative.exemples.serveur")}</p>
          </form>

          {retours.length > 0 && (
            <ul className="space-y-0.5 text-xs" data-testid="retours-exemples">
              {retours.map((r) => (
                <li
                  key={r.id}
                  className={cn(r.ton === "erreur" && "text-destructive", r.ton === "ok" && "text-success-foreground")}
                >
                  {r.texte}
                </li>
              ))}
            </ul>
          )}

          <Suivi
            comptes={comptesLangue}
            aChercher={aChercher}
            aLire={aLire}
            langue={langue}
            nomLabel={nomLabel}
            onEffacer={() => effacerSuivi.mutate(langue)}
          />
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
                occupe={relire.isPending && relire.variables === e.id}
                onLabel={(label) => changerLabel.mutate({ id: e.id, label })}
                onRelire={() => relire.mutate(e.id)}
                onSupprimer={() => supprimer.mutate(e.id)}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

interface Retour {
  id: number;
  ton: "info" | "ok" | "erreur";
  texte: string;
}

let idRetour = 0;

/** La ligne de suivi d'un compte collé : en file, en cours, ou ce qu'Apify a trouvé. */
function ligneCompte(c: CompteNatif, t: TFunction): [string, Retour["ton"]] {
  const base = { pseudo: c.pseudo, posts: c.posts ?? 0, n: c.slideshows ?? 0, ajoutes: c.ajoutes ?? 0, erreur: c.erreur ?? "" };
  if (c.statut === "erreur") return [t("relectureNative.exemples.suivi.compteErreur", base), "erreur"];
  if (c.statut === "en_attente") {
    if (c.pris_le) return [t("relectureNative.exemples.suivi.compteEnCours", base), "info"];
    if (c.erreur) return [t("relectureNative.exemples.suivi.compteNouvelEssai", base), "erreur"];
    return [t("relectureNative.exemples.suivi.compteAttente", base), "info"];
  }
  if (!c.slideshows) return [t("relectureNative.exemples.suivi.compteVide", base), "erreur"];
  if (c.verifies === false) return [t("relectureNative.exemples.suivi.compteNonVerifie", base), "info"];
  return [t("relectureNative.exemples.suivi.compte", base), "ok"];
}

/** Ce que le serveur a à faire et ce qu'il a fait pour chaque compte collé, du plus récent au plus ancien. */
function Suivi({
  comptes,
  aChercher,
  aLire,
  langue,
  nomLabel,
  onEffacer,
}: {
  comptes: ReadonlyArray<CompteNatif>;
  aChercher: number;
  aLire: number;
  langue: string;
  nomLabel: ReadonlyMap<string, string>;
  onEffacer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const enCours = aChercher + aLire > 0;
  const termines = comptes.some((c) => c.statut !== "en_attente");
  return (
    <div className="space-y-1.5" data-testid="suivi-exemples">
      <div className="flex items-center justify-between gap-2">
        <p className={MICRO_LABEL}>{t("relectureNative.exemples.suivi.titre")}</p>
        {termines && (
          <Button variant="ghost" size="sm" onClick={onEffacer}>
            {t("relectureNative.exemples.suivi.effacer")}
          </Button>
        )}
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {enCours ? (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        )}
        {enCours
          ? t("relectureNative.exemples.suivi.enCours", { comptes: aChercher, lectures: aLire })
          : t("relectureNative.exemples.suivi.rien")}
      </p>
      {comptes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("relectureNative.exemples.suivi.vide", { langue: nomLangue(langue) })}</p>
      ) : (
        <ol className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border bg-muted/30 p-2 font-mono text-xs">
          {comptes.map((c) => {
            const [ligne, ton] = ligneCompte(c, t);
            return (
              <li
                key={c.id}
                className={cn(
                  "grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-2",
                  ton === "erreur" && "text-destructive",
                  ton === "ok" && "text-success-foreground",
                )}
              >
                <span className="text-muted-foreground tabular-nums">
                  {new Date(c.created_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="break-words">{ligne}</span>
                <span className="text-muted-foreground">
                  {(c.label_id && nomLabel.get(c.label_id)) || t("relectureNative.exemples.sansLabel")}
                </span>
              </li>
            );
          })}
        </ol>
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
  // Pris par un passage du serveur : la lecture est en cours.
  const enLecture = e.statut === "en_attente" && Boolean(e.pris_le);
  const slides = [...e.slides].sort((a, b) => a.position - b.position);
  const accroche = slides[0]?.texte.split("\n")[0] ?? "";

  return (
    <li className="space-y-3 px-5 py-3" data-testid={`exemple-${e.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", CLASSES_TON[ton])}>
              {enLecture ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Icone className="size-3.5" aria-hidden />}
              {t(`relectureNative.exemples.statuts.${enLecture ? "en_lecture" : e.statut}`)}
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
          {e.statut === "en_attente" && e.erreur && (
            <p className="text-xs text-muted-foreground">{t("relectureNative.exemples.nouvelEssai", { erreur: e.erreur })}</p>
          )}
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
          {e.statut === "erreur" && (
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
