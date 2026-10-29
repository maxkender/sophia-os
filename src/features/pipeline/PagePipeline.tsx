import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, CornerDownLeft, Mail, UserX } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";
import { annulerKill } from "@/features/cohortes/api";
import { drapeauPays } from "@/features/moteur/pays";
import { localeDate } from "@/locales/localeDate";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import {
  arreterDepuisPipeline,
  dernierTexteRelance,
  envoyerSurUpwork,
  lireArretes,
  lireHistorique,
  lirePipeline,
  type CartePipeline,
} from "./api";
import { aRisque, cartesAvancees, COLONNES, duree, FILTRES_VIDES, filtrer, parColonne, sansCanal, type FiltresPipeline } from "./logique";

const CLE = ["pipeline"] as const;
/** Le temps où une carte qui vient d'avancer reste verte, avec sa flèche, dans son ancienne colonne. */
const PASSAGE_MS = 1200;

function useFormat() {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  const d = (ms: number) => {
    const x = duree(ms);
    return t(`pipeline.duree.${x.unite}`, { n: x.n });
  };
  return { le: (iso: string) => date.format(new Date(iso)), d };
}

/** Une carte : nom, drapeau, HM, depuis quand, et son état (icône + mot). */
function Carte({
  c,
  maintenant,
  passage,
  onOuvrir,
}: {
  c: CartePipeline;
  maintenant: number;
  /** Vient d'avancer : verte, avec une flèche, avant de glisser. */
  passage: boolean;
  onOuvrir: (c: CartePipeline) => void;
}) {
  const { t } = useTranslation();
  const { le, d } = useFormat();
  const etat = passage ? "fait" : c.etat;
  const style = {
    attente: "border-border bg-card",
    relance: "border-warning/60 bg-warning/10",
    repondu: "border-info/60 bg-info/10",
    kill: "border-destructive/70 bg-destructive/10",
    fait: "border-success/60 bg-success/10",
  }[etat];
  return (
    <button
      type="button"
      onClick={() => onOuvrir(c)}
      data-carte={c.carte_id}
      data-etat={etat}
      className={cn(
        "w-full space-y-1 rounded-lg border p-2 text-left text-xs shadow-xs transition-colors hover:bg-muted/40",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-4 motion-safe:duration-300",
        style,
      )}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <span aria-hidden>{drapeauPays(c.pays)}</span>
        <span className="truncate">{c.nom ?? "—"}</span>
        {passage && <ArrowRight className="ml-auto size-4 shrink-0 text-success-foreground" aria-label={t("pipeline.avance")} />}
      </p>
      {c.deuxieme && <p className="text-[11px] text-muted-foreground">{t("pipeline.deuxieme", { nom: c.nom ?? "—" })}</p>}
      {sansCanal(c) && (
        <Badge variant="destructive" className="text-[10px]" data-sans-canal>
          {t("pipeline.sansCanal")}
        </Badge>
      )}
      <p className="text-muted-foreground">
        {c.hm_prenom ? t("pipeline.hm", { hm: c.hm_prenom }) : t("pipeline.sansHm")}
        {c.colonne_depuis && ` · ${t("pipeline.depuis", { d: d(maintenant - Date.parse(c.colonne_depuis)) })}`}
      </p>
      {etat === "attente" && (
        <p className="flex items-center gap-1 text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {t("pipeline.etats.attente")}
        </p>
      )}
      {etat === "relance" && c.message_at && (
        <p className="flex flex-wrap items-center gap-1 text-warning-foreground">
          <Mail className="size-3.5" aria-hidden />
          {t(c.message_test ? "pipeline.etats.relancePrevue" : "pipeline.etats.relance", {
            date: le(c.message_at),
            canal: t(`nudges.canaux.${c.message_canal ?? "upwork"}`, { defaultValue: c.message_canal ?? "" }),
          })}
          {c.limite_at && (
            <span className="font-medium">· {t("pipeline.killDans", { d: d(Date.parse(c.limite_at) - maintenant) })}</span>
          )}
        </p>
      )}
      {etat === "repondu" && (
        <p className="text-info-foreground">
          <span className="inline-flex items-center gap-1 font-medium">
            <CornerDownLeft className="size-3.5" aria-hidden />
            {t("pipeline.etats.repondu")}
          </span>{" "}
          {c.reponse_extrait && <span className="line-clamp-2">« {c.reponse_extrait} »</span>}
        </p>
      )}
      {etat === "kill" && c.kill_prevu_at && (
        <p className="flex items-center gap-1 font-medium text-destructive">
          <AlertTriangle className="size-3.5" aria-hidden />
          {t("pipeline.etats.kill", { d: d(Date.parse(c.kill_prevu_at) - maintenant) })}
        </p>
      )}
      {etat === "fait" && (
        <p className="flex items-center gap-1 text-success-foreground">
          <CheckCircle2 className="size-3.5" aria-hidden />
          {t("pipeline.etats.fait")}
        </p>
      )}
      {c.pause_jusqu_au && <p className="text-muted-foreground">{t("pipeline.pause", { date: le(c.pause_jusqu_au) })}</p>}
    </button>
  );
}

/** Le panneau d'une carte : historique, liens, actions. */
function Panneau({ c, onFermer }: { c: CartePipeline | null; onFermer: () => void }) {
  const { t } = useTranslation();
  const { le } = useFormat();
  const { role } = useAuth();
  const qc = useQueryClient();
  const historique = useQuery({
    queryKey: [...CLE, "historique", c?.poster_id],
    queryFn: () => lireHistorique(c!.poster_id),
    enabled: Boolean(c),
  });
  const texteDefaut = useQuery({
    queryKey: [...CLE, "texte", c?.poster_id],
    queryFn: () => dernierTexteRelance(c!.poster_id),
    enabled: Boolean(c),
  });
  const [texte, setTexte] = React.useState("");
  React.useEffect(() => setTexte(texteDefaut.data ?? ""), [texteDefaut.data]);
  const finir = () => void qc.invalidateQueries({ queryKey: CLE });
  const annuler = useMutation({ mutationFn: () => annulerKill(c!.kill_id!), onSuccess: finir });
  const arreter = useMutation({ mutationFn: () => arreterDepuisPipeline(c!.poster_id), onSuccess: finir });
  const upwork = useMutation({ mutationFn: () => envoyerSurUpwork(c!.poster_id, texte, c!.etape_attendue), onSuccess: finir });
  const erreur = (annuler.error ?? arreter.error ?? upwork.error) as Error | null;
  return (
    <Sheet open={Boolean(c)} onOpenChange={(o) => !o && onFermer()}>
      <SheetPopup side="right" data-testid="panneau-pipeline">
        {c && (
          <>
            <SheetHeader>
              <SheetTitle>
                {drapeauPays(c.pays)} {c.nom ?? "—"}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                {c.deuxieme ? t("pipeline.deuxieme", { nom: c.nom ?? "—" }) : t(`pipeline.colonnes.${c.colonne}`)}
                {c.hm_prenom && ` · ${t("pipeline.hm", { hm: c.hm_prenom })}`}
              </p>
            </SheetHeader>
            <SheetPanel className="space-y-5">
              <div className="flex flex-wrap gap-3 text-sm">
                {c.upwork_contrat_url && (
                  <a className="text-primary underline-offset-2 hover:underline" href={c.upwork_contrat_url} target="_blank" rel="noreferrer">
                    {t("pipeline.liens.upwork")}
                  </a>
                )}
                {c.handle && (
                  <a
                    className="text-primary underline-offset-2 hover:underline"
                    href={`https://www.tiktok.com/@${c.handle.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{c.handle.replace(/^@/, "")}
                  </a>
                )}
                {c.slack_user_id ? (
                  <a
                    className="text-primary underline-offset-2 hover:underline"
                    href={`https://slack.com/app_redirect?channel=${c.slack_user_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("pipeline.liens.slack")}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{t("pipeline.liens.sansSlack")}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {c.kill_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={annuler.isPending}
                    onClick={() => window.confirm(t("cohortes.kills.annulerConfirm", { nom: c.nom ?? "—" })) && annuler.mutate()}
                  >
                    {t("pipeline.actions.annulerKill")}
                  </Button>
                )}
                {role === "admin" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={arreter.isPending}
                    onClick={() => window.confirm(t("pipeline.actions.arreterConfirm", { nom: c.nom ?? "—" })) && arreter.mutate()}
                  >
                    {t("pipeline.actions.arreter")}
                  </Button>
                )}
              </div>

              <div className="space-y-2 rounded-lg border p-3" data-testid="send-upwork">
                <p className="text-sm font-medium">{t("pipeline.upwork.titre")}</p>
                <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} aria-label={t("pipeline.upwork.titre")} rows={4} />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!texte.trim() || upwork.isPending || !c.upwork_contrat_url}
                    onClick={() => window.confirm(t("pipeline.upwork.confirm", { nom: c.nom ?? "—" })) && upwork.mutate()}
                  >
                    {t("pipeline.upwork.envoyer")}
                  </Button>
                  {upwork.isSuccess && <span className="text-xs text-success-foreground">{t("pipeline.upwork.ok")}</span>}
                  {!c.upwork_contrat_url && <span className="text-xs text-muted-foreground">{t("pipeline.upwork.sansContrat")}</span>}
                </div>
              </div>
              {erreur && <p className="text-sm text-destructive">{erreur.message}</p>}

              <div className="space-y-2">
                <p className="text-sm font-medium">{t("pipeline.historique")}</p>
                <ol className="space-y-1.5 border-s ps-3 text-sm" data-testid="historique">
                  {(historique.data ?? []).map((e, i) => (
                    <li key={`${e.type}-${e.at}-${i}`}>
                      <span className="text-xs text-muted-foreground">{le(e.at)}</span>{" "}
                      <span className="font-medium">{t(`pipeline.evenements.${e.type}`, { defaultValue: e.type })}</span>
                      {e.detail && <span className="block whitespace-pre-wrap text-xs text-muted-foreground">{e.detail}</span>}
                    </li>
                  ))}
                  {historique.data?.length === 0 && <li className="text-muted-foreground">{t("pipeline.vide")}</li>}
                </ol>
              </div>
            </SheetPanel>
          </>
        )}
      </SheetPopup>
    </Sheet>
  );
}

/**
 * Pipeline : toutes les recrues, toutes cohortes confondues, de l'offre
 * acceptée au 1er jour de posts. En direct (Supabase Realtime sur
 * `recrue_evenements`, sinon une relecture toutes les 60 s). Une carte qui
 * avance passe au vert, une flèche apparaît, puis elle glisse dans la colonne
 * suivante (sans animation si « réduire les animations »).
 */
export function PagePipeline({
  maintenant: fixe,
  cohorte = "",
  risqueInitial = false,
}: {
  maintenant?: Date;
  /** Prompt 22, partie 4 (Recruits) : le lundi de cohorte choisi ; vide = toutes. */
  cohorte?: string;
  /** Arrivée depuis Overview → Today (« Kills en cours ») : seulement les cartes à risque. */
  risqueInitial?: boolean;
} = {}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const cartes = useQuery({ queryKey: [...CLE, "cartes"], queryFn: lirePipeline, refetchInterval: 60_000 });
  const arretes = useQuery({ queryKey: [...CLE, "arretes"], queryFn: lireArretes, refetchInterval: 60_000 });
  const [filtres, setFiltres] = React.useState<FiltresPipeline>(() => ({ ...FILTRES_VIDES, risque: risqueInitial }));
  const [ouverteId, setOuverteId] = React.useState<string | null>(null);
  const [horloge, setHorloge] = React.useState(() => (fixe ?? new Date()).getTime());

  // En direct : chaque nouvel événement relit les cartes.
  React.useEffect(() => {
    const canal = supabase
      .channel("pipeline-recrues")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "recrue_evenements" }, () => {
        void qc.invalidateQueries({ queryKey: CLE });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [qc]);

  // Les comptes à rebours avancent d'eux-mêmes.
  React.useEffect(() => {
    if (fixe) return;
    const id = window.setInterval(() => setHorloge(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [fixe]);

  // Les cartes qui viennent d'avancer restent un instant dans leur ancienne colonne.
  const colonnesAvant = React.useRef(new Map<string, number>());
  const [passages, setPassages] = React.useState(new Map<string, number>());
  React.useEffect(() => {
    if (!cartes.data) return;
    const avancees = cartesAvancees(colonnesAvant.current, cartes.data);
    colonnesAvant.current = new Map(cartes.data.map((c) => [c.carte_id, c.colonne]));
    if (avancees.size === 0) return;
    setPassages(avancees);
    const id = window.setTimeout(() => setPassages(new Map()), PASSAGE_MS);
    return () => window.clearTimeout(id);
  }, [cartes.data]);

  const toutes = (cartes.data ?? []).filter((c) => !cohorte || c.cohorte_lundi === cohorte);
  // Le panneau suit la carte en direct (Kill annulé, relance, réponse).
  const ouverte = toutes.find((c) => c.carte_id === ouverteId) ?? null;
  const visibles = filtrer(toutes, filtres).map((c) => (passages.has(c.carte_id) ? { ...c, colonne: passages.get(c.carte_id)! } : c));
  const colonnes = parColonne(visibles);
  const hms = [...new Map(toutes.filter((c) => c.hm_id).map((c) => [c.hm_id!, c.hm_prenom ?? "—"])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const pays = [...new Set(toutes.map((c) => c.pays).filter((p): p is string => Boolean(p)))].sort();
  const aRisques = toutes.filter(aRisque).length;

  return (
    <div className="space-y-4" data-testid="page-pipeline">
      <PageHeader title={t("pipeline.titre")} description={t("pipeline.description")} />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          aria-label={t("pipeline.filtres.hm")}
          className="h-8 rounded-md border bg-background px-2"
          value={filtres.hm}
          onChange={(e) => setFiltres({ ...filtres, hm: e.target.value })}
        >
          <option value="">{t("pipeline.filtres.toutesHm")}</option>
          {hms.map(([id, prenom]) => (
            <option key={id} value={id}>
              {prenom}
            </option>
          ))}
        </select>
        <select
          aria-label={t("pipeline.filtres.pays")}
          className="h-8 rounded-md border bg-background px-2"
          value={filtres.pays}
          onChange={(e) => setFiltres({ ...filtres, pays: e.target.value })}
        >
          <option value="">{t("pipeline.filtres.tousPays")}</option>
          {pays.map((p) => (
            <option key={p} value={p}>
              {drapeauPays(p)} {p}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={filtres.risque} onChange={(e) => setFiltres({ ...filtres, risque: e.target.checked })} />
          {t("pipeline.filtres.risque", { n: aRisques })}
        </label>
        <span className="text-xs text-muted-foreground">{t("pipeline.direct")}</span>
      </div>

      {cartes.error && <p className="text-sm text-destructive">{(cartes.error as Error).message}</p>}

      <div className="grid gap-3 overflow-x-auto pb-2 [grid-template-columns:repeat(6,minmax(12rem,1fr))]">
        {COLONNES.map((n) => (
          <section key={n} className="flex min-w-0 flex-col gap-2 rounded-xl bg-muted/30 p-2" data-colonne={n}>
            <h2 className="flex items-center justify-between px-1 text-xs font-semibold">
              <span>{t(`pipeline.colonnes.${n}`)}</span>
              <Badge variant="secondary" data-nombre>
                {colonnes[n]!.length}
              </Badge>
            </h2>
            {colonnes[n]!.map((c) => (
              <Carte key={c.carte_id} c={c} maintenant={horloge} passage={passages.has(c.carte_id)} onOuvrir={(x) => setOuverteId(x.carte_id)} />
            ))}
          </section>
        ))}
      </div>

      <section className="space-y-2 rounded-xl border p-3" data-testid="arretes">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserX className="size-4" aria-hidden />
          {t("pipeline.arretes", { n: arretes.data?.length ?? 0 })}
        </h2>
        <ul className="flex flex-wrap gap-2 text-xs">
          {(arretes.data ?? []).map((a) => (
            <li key={a.poster_id} className="rounded-md border bg-muted/30 px-2 py-1">
              {drapeauPays(a.pays)} {a.nom ?? "—"} · {t(`cohortes.arrets.sources.${a.source}`, { defaultValue: a.source })}
            </li>
          ))}
          {arretes.data?.length === 0 && <li className="text-muted-foreground">{t("pipeline.vide")}</li>}
        </ul>
      </section>

      <Panneau c={ouverte} onFermer={() => setOuverteId(null)} />
    </div>
  );
}
