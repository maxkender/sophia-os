import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, RefreshCw, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  type ActionCkd,
  annulerCkd,
  type ArretCkd,
  type ControleCkd,
  deciderCkd,
  enregistrerCanalSlack,
  enregistrerSlackHm,
  enregistrerTextesNudges,
  envoyerAuxHm,
  envoyerNudgesCkd,
  type ChiffresCkd,
  type DecisionCkd,
  type HistoriqueCkd,
  listerHistorique,
  type HmCkd,
  type LabelCkd,
  lancerControle,
  lireCanalSlack,
  lireTextesNudges,
  listerArrets,
  listerHandles,
  listerManques,
  type ManqueCkd,
  MOTIFS_NUDGE,
  type TextesNudges,
  verifierSlackCkd,
  lirePartBonsPosts,
  listerControles,
  listerHms,
  listerJournal,
  listerLabels,
  listerPersonnes,
  listerPropositions,
  listerReglages,
  type PersonneCkd,
  type PropositionCkd,
  type ReglageCkd,
  reglerCkd,
  type TypeControle,
} from "@/features/ckd/api";
import {
  aEnvoyer,
  annulable,
  boutonDeLaDecision,
  BOUTONS_PAR_REGLE,
  compterActions,
  creeUnCompte,
  DECISION_DU_BOUTON,
  enRetard,
  resumerHistorique,
  type Tendance,
  tendanceDecision,
  defReglage,
  type DefReglage,
  exceptionsLabel,
  formaterValeur,
  grouperParHm,
  lienTiktok,
  lireSaisie,
  ORDRE_ACTIONS,
  pourcentage,
  REGLAGES,
  reglageDuNiveau,
  valeurEffective,
  valeurEnSaisie,
} from "@/features/ckd/logique";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

const CLE = ["ckd"] as const;

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

const VARIANTE: Record<ActionCkd, "error" | "warning" | "success" | "info"> = {
  ne_pas_renouveler: "error",
  recreer: "warning",
  doubler: "success",
  nudge: "info",
};

type Onglet = "samedi" | "jeudi" | "historique" | "reglages";

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function nomPersonne(p: PersonneCkd | undefined): string {
  if (!p) return "";
  return [p.prenom, p.nom].filter(Boolean).join(" ").trim();
}

function useDate() {
  const { i18n } = useTranslation();
  return React.useCallback(
    (iso: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }) => {
      if (!iso) return "";
      // Une date seule (« 2026-10-24 ») est une date de Paris : midi évite tout décalage.
      const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
      return new Intl.DateTimeFormat(localeDate(i18n.language), { timeZone: "Europe/Paris", ...options }).format(d);
    },
    [i18n.language],
  );
}

/**
 * Admin → Check, Kill or Double (PROMPT 5, migration 0326). Le jeudi 6 h, les
 * nudges proposés aux comptes dans leur première semaine ; le samedi 6 h, les
 * comptes à tuer (recréer, ne pas renouveler) et les posteurs à doubler. L'admin
 * décide ligne par ligne (0328) ; les décisions partent aux HMs dans
 * #managers-hq (bouton, ou tout seul le dimanche à 12 h).
 */
export function AdminCheckKillDoublePage() {
  const { t } = useTranslation();
  const [onglet, setOnglet] = React.useState<Onglet>("samedi");

  return (
    <div className="space-y-5" data-testid="page-ckd">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{t("ckd.titre")}</h2>
        <p className="text-xs text-muted-foreground">{t("ckd.description")}</p>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          <li>{t("ckd.calendrierJeudi")}</li>
          <li>{t("ckd.calendrierSamedi")}</li>
          <li>{t("ckd.calendrierVues")}</li>
        </ul>
        <p className="text-xs text-muted-foreground">{t("ckd.circuit")}</p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {(["samedi", "jeudi", "historique", "reglages"] as const).map((o) => (
          <Button
            key={o}
            role="tab"
            aria-selected={onglet === o}
            size="sm"
            variant={onglet === o ? "default" : "outline"}
            onClick={() => setOnglet(o)}
          >
            {t(`ckd.onglets.${o}`)}
          </Button>
        ))}
      </div>

      {onglet === "reglages" ? (
        <VueReglages />
      ) : onglet === "historique" ? (
        <VueHistorique />
      ) : (
        <VueControles key={onglet} type={onglet} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Propositions (samedi) et nudges (jeudi)
// ---------------------------------------------------------------------------

function VueControles({ type }: { type: TypeControle }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const date = useDate();

  const controles = useQuery({ queryKey: [...CLE, "controles"], queryFn: listerControles });
  const duType = React.useMemo(
    () => (controles.data ?? []).filter((c) => c.type === type),
    [controles.data, type],
  );
  const [choisi, setChoisi] = React.useState<string | null>(null);
  const controle: ControleCkd | undefined = duType.find((c) => c.id === choisi) ?? duType[0];

  const propositions = useQuery({
    queryKey: [...CLE, "propositions", controle?.id],
    queryFn: () => listerPropositions(controle!.id),
    enabled: Boolean(controle),
  });
  // Le samedi, les posts manqués de la semaine (pour info, sous les propositions).
  const manques = useQuery({
    queryKey: [...CLE, "manques", controle?.jour],
    queryFn: () => listerManques(controle!.jour),
    enabled: type === "samedi" && Boolean(controle),
  });
  const ids = React.useMemo(() => {
    const s = new Set<string>();
    for (const p of [...(propositions.data ?? []), ...(manques.data ?? [])]) {
      s.add(p.poster_id);
      if (p.hm_id) s.add(p.hm_id);
    }
    for (const p of propositions.data ?? []) if (p.decision_par) s.add(p.decision_par);
    return [...s].sort();
  }, [propositions.data, manques.data]);
  const comptesIds = React.useMemo(
    () => [...new Set((propositions.data ?? []).map((p) => p.compte_id))].sort(),
    [propositions.data],
  );
  const nouveauxIds = React.useMemo(
    () => (propositions.data ?? []).map((p) => p.nouveau_compte_id).filter(Boolean).sort() as string[],
    [propositions.data],
  );
  const arrets = useQuery({
    queryKey: [...CLE, "arrets", comptesIds],
    queryFn: () => listerArrets(comptesIds),
    enabled: comptesIds.length > 0,
  });
  const nouveaux = useQuery({
    queryKey: [...CLE, "nouveaux", nouveauxIds],
    queryFn: () => listerHandles(nouveauxIds),
    enabled: nouveauxIds.length > 0,
  });
  const personnes = useQuery({
    queryKey: [...CLE, "personnes", ids],
    queryFn: () => listerPersonnes(ids),
    enabled: ids.length > 0,
  });
  const labels = useQuery({ queryKey: [...CLE, "labels"], queryFn: listerLabels });

  const recalculer = useMutation({
    mutationFn: () => lancerControle(type, controle?.jour),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
  const envoyerNudges = useMutation({
    mutationFn: () => envoyerNudgesCkd(controle!.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
  const envoyerHm = useMutation({
    mutationFn: () => envoyerAuxHm(controle!.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });

  const parId = React.useMemo(
    () => new Map((personnes.data ?? []).map((p) => [p.id, p] as const)),
    [personnes.data],
  );
  const labelParId = React.useMemo(
    () => new Map((labels.data ?? []).map((l) => [l.id, l] as const)),
    [labels.data],
  );
  const arretDe = React.useMemo(
    () => new Map((arrets.data ?? []).map((a) => [a.compte_id, a] as const)),
    [arrets.data],
  );
  const handleDe = React.useMemo(
    () => new Map((nouveaux.data ?? []).map((c) => [c.id, c.handle_tiktok] as const)),
    [nouveaux.data],
  );
  const liste = propositions.data ?? [];
  const compte = compterActions(liste);
  const groupes = grouperParHm(liste);
  const nudgesEnAttente = liste.filter((p) => p.action === "nudge" && !p.decision).length;
  const prets = liste.filter(aEnvoyer).length;
  const sansDecision = liste.filter((p) => !p.decision).length;
  const retards = liste.filter((p) => enRetard(p, type)).length;
  const erreur = controles.error ?? propositions.error ?? recalculer.error ?? envoyerNudges.error ?? envoyerHm.error;

  return (
    <div className="space-y-4" data-testid={`vue-${type}`}>
      <div className="flex flex-wrap items-center gap-2">
        {duType.length > 0 && (
          <select
            className={selectClass}
            aria-label={t("ckd.controle")}
            value={controle?.id ?? ""}
            onChange={(e) => setChoisi(e.target.value)}
          >
            {duType.map((c) => (
              <option key={c.id} value={c.id}>
                {t("ckd.controleDu", { date: date(c.jour, { weekday: "long", day: "numeric", month: "long" }) })}
              </option>
            ))}
          </select>
        )}
        {controle && (
          <span className="text-xs text-muted-foreground">
            {t("ckd.calculeLe", { date: date(controle.lance_at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) })}
          </span>
        )}
        <Button
          className="ml-auto"
          size="sm"
          variant="outline"
          loading={recalculer.isPending}
          onClick={() => recalculer.mutate()}
        >
          <RefreshCw />
          {controle ? t("ckd.recalculer") : t("ckd.calculer")}
        </Button>
      </div>

      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}

      {controles.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : !controle ? (
        <EmptyState title={t(`ckd.aucunControle.${type}`)} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {ORDRE_ACTIONS.filter((a) => compte[a] > 0).map((a) => (
              <Badge key={a} variant={VARIANTE[a]}>
                {t(`ckd.actions.${a}`)} · {compte[a]}
              </Badge>
            ))}
            {liste.length === 0 && !propositions.isPending && (
              <span className="text-sm text-muted-foreground">{t(`ckd.vide.${type}`)}</span>
            )}
          </div>
          {liste.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs" data-testid="barre-envoi">
              <span>{t("ckd.etat", { sans: sansDecision, prets })}</span>
              {retards > 0 && <Badge variant="warning">{t("ckd.enRetard", { n: retards })}</Badge>}
              {controle.slack_ts && <span className="text-muted-foreground">{t("ckd.recapPoste")}</span>}
              {controle.rappel_at && (
                <span className="text-muted-foreground">
                  {t("ckd.rappelEnvoye", { date: date(controle.rappel_at, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) })}
                </span>
              )}
              <span className="ml-auto flex flex-wrap gap-1.5">
                {type === "jeudi" && nudgesEnAttente > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={envoyerNudges.isPending}
                    onClick={() => {
                      if (window.confirm(t("ckd.confirmNudges", { n: nudgesEnAttente }))) envoyerNudges.mutate();
                    }}
                  >
                    {t("ckd.envoyerNudges", { n: nudgesEnAttente })}
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={prets === 0}
                  loading={envoyerHm.isPending}
                  onClick={() => {
                    if (window.confirm(t("ckd.confirmEnvoiHm", { n: prets }))) envoyerHm.mutate();
                  }}
                >
                  <Send />
                  {t("ckd.envoyerHm", { n: prets })}
                </Button>
              </span>
              {controle.slack_erreur && (
                <p role="alert" className="w-full text-destructive">
                  {t("ckd.erreurSlack", { erreur: controle.slack_erreur })}
                </p>
              )}
              {envoyerHm.data && (
                <p className="w-full text-muted-foreground">{t("ckd.envoyees", { n: envoyerHm.data.envoyees })}</p>
              )}
            </div>
          )}
          {groupes.map((g) => {
            const hm = g.hmId ? parId.get(g.hmId) : undefined;
            return (
              <Card key={g.hmId ?? "sans-hm"} data-testid={`groupe-hm-${g.hmId ?? "aucun"}`}>
                <CardHeader>
                  <CardTitle className="text-base">{hm ? nomPersonne(hm) : t("ckd.sansHm")}</CardTitle>
                  {hm?.zone_recrutement && <CardDescription>{hm.zone_recrutement}</CardDescription>}
                </CardHeader>
                <CardContent className="divide-y">
                  {g.propositions.map((p) => (
                    <LigneProposition
                      key={p.id}
                      p={p}
                      type={type}
                      poster={parId.get(p.poster_id)}
                      label={p.label_id ? labelParId.get(p.label_id) : undefined}
                      decideur={p.decision_par ? parId.get(p.decision_par) : undefined}
                      arret={arretDe.get(p.compte_id)}
                      nouveauHandle={p.nouveau_compte_id ? handleDe.get(p.nouveau_compte_id) ?? null : null}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })}
          {type === "samedi" && (
            <CarteManques manques={manques.data ?? []} propositions={liste} parId={parId} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Les comptes qui ont manqué des posts cette semaine sans sortir en Absent :
 * pour info (la discipline se règle avec le HM), groupés par HM.
 */
function CarteManques({
  manques,
  propositions,
  parId,
}: {
  manques: ManqueCkd[];
  propositions: PropositionCkd[];
  parId: Map<string, PersonneCkd>;
}) {
  const { t } = useTranslation();
  const date = useDate();
  const absents = new Set(propositions.filter((p) => p.regle === "absent").map((p) => p.compte_id));
  const lignes = manques
    .filter((m) => !absents.has(m.compte_id))
    .sort(
      (a, b) =>
        b.prevus - b.publies - (a.prevus - a.publies) || (a.handle ?? "").localeCompare(b.handle ?? ""),
    );
  if (lignes.length === 0) return null;
  return (
    <Card data-testid="carte-manques">
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.manques.titre", { n: lignes.length })}</CardTitle>
        <CardDescription>{t("ckd.manques.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">{t("ckd.manques.compte")}</th>
              <th className="py-1 pr-3 font-medium">{t("ckd.hm")}</th>
              <th className="py-1 pr-3 text-right font-medium">{t("ckd.manques.publies")}</th>
              <th className="py-1 font-medium">{t("ckd.manques.jours")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lignes.map((m) => (
              <tr key={m.compte_id} data-testid={`manque-${m.handle}`}>
                <td className="py-1 pr-3">
                  <Link to={`/admin/createurs/${m.compte_id}`} className="underline-offset-2 hover:underline">
                    {drapeauPays(m.pays)} @{m.handle}
                  </Link>
                </td>
                <td className="py-1 pr-3">{m.hm_id ? nomPersonne(parId.get(m.hm_id)) : t("ckd.sansHm")}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {m.publies}/{m.prevus}
                </td>
                <td className="py-1 text-muted-foreground">{m.jours.map((j) => date(j)).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LienPost({ post }: { post: { vues: number; url: string; jour: string } | null }) {
  const date = useDate();
  if (!post) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
      <span className="tabular-nums">{post.vues.toLocaleString()}</span>
      <span className="text-muted-foreground">({date(post.jour)})</span>
      <ExternalLink className="size-3" />
    </a>
  );
}

function LigneProposition({
  p,
  type,
  poster,
  label,
  decideur,
  arret,
  nouveauHandle,
}: {
  p: PropositionCkd;
  type: TypeControle;
  poster?: PersonneCkd;
  label?: LabelCkd;
  decideur?: PersonneCkd;
  arret?: ArretCkd;
  nouveauHandle: string | null;
}) {
  const { t } = useTranslation();
  const date = useDate();
  const d = p.donnees;
  const per = d.periode;
  const tiktok = lienTiktok(d.handle);
  const manques = per.attendus - per.publies;

  return (
    <div className="space-y-2 py-3" data-testid={`proposition-${d.handle}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={VARIANTE[p.action]}>{t(`ckd.actions.${p.action}`)}</Badge>
        <span className="font-medium">
          {drapeauPays(p.pays)} @{d.handle}
        </span>
        {tiktok && (
          <a href={tiktok} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            TikTok <ExternalLink className="inline size-3" />
          </a>
        )}
        <Link to={`/admin/createurs/${p.compte_id}`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          {t("ckd.ficheCompte")}
        </Link>
        <span className="text-xs text-muted-foreground">
          {[nomPersonne(poster), nomPaysIso(p.pays), p.application, label?.nom].filter(Boolean).join(" · ")}
        </span>
        {d.abonnes !== null && d.abonnes !== undefined && (
          <Badge variant="outline">{t("ckd.abonnes", { n: d.abonnes.toLocaleString() })}</Badge>
        )}
      </div>

      <p className="text-sm">
        {t(`ckd.regles.${p.regle}`)}
        {d.motifs.length > 0 && (
          <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
            {d.motifs.map((m) => (
              <Badge key={m} variant="info" size="sm">
                {t(`ckd.motifs.${m}`)}
              </Badge>
            ))}
          </span>
        )}
      </p>

      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{t("ckd.periode")}</dt>
          <dd>{t("ckd.periodeValeur", { du: date(per.du), au: date(per.au) })}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("ckd.publies")}</dt>
          <dd className={cn(manques > 0 && "text-warning-foreground")}>
            {t("ckd.publiesValeur", { publies: per.publies, attendus: per.attendus, mesures: per.mesures })}
            {per.liens_manquants.length > 0 && (
              <span className="ml-1">
                · {t("ckd.liensManquants", { jours: per.liens_manquants.map((l) => date(l.jour)).join(", ") })}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("ckd.medianeMoyenne")}</dt>
          <dd className="tabular-nums">
            {(per.mediane ?? 0).toLocaleString()} / {(per.moyenne ?? 0).toLocaleString()}
            <span className="ml-1 text-muted-foreground">
              {t("ckd.medianeRef", {
                valeur: (d.mediane_ref.valeur ?? 0).toLocaleString(),
                source: t(`ckd.sourcesMediane.${d.mediane_ref.source}`),
                n: d.mediane_ref.n_comptes,
              })}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("ckd.plusBas")}</dt>
          <dd>
            <LienPost post={per.bas} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("ckd.plusHaut")}</dt>
          <dd>
            <LienPost post={per.haut} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("ckd.seuilBon")}</dt>
          <dd className="tabular-nums">
            {d.seuil_bon_post.valeur.toLocaleString()}{" "}
            <span className="text-muted-foreground">({t(`ckd.sources.${d.seuil_bon_post.source}`)})</span>
            {" · "}
            {t("ckd.bonsMorts", { bons: per.bons, morts: per.morts })}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{t("ckd.recreations", { n: d.recreations })}</span>
        {d.autres_comptes.length > 0 && (
          <span>
            {t("ckd.autresComptes")}{" "}
            {d.autres_comptes.map((c, i) => (
              <React.Fragment key={c.id}>
                {i > 0 && ", "}
                <Link to={`/admin/createurs/${c.id}`} className={cn("underline-offset-2 hover:underline", !c.actif && "line-through")}>
                  @{c.handle ?? "?"}
                </Link>
              </React.Fragment>
            ))}
          </span>
        )}
        <details>
          <summary className="cursor-pointer">{t("ckd.seuilsAppliques")}</summary>
          <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {REGLAGES.filter((r) => d.reglages[r.cle]).map((r) => (
              <li key={r.cle}>
                {t(`ckd.reglages.${r.cle}`)} : {formaterValeur(r, d.reglages[r.cle].v, t("ckd.oui"), t("ckd.non"))}{" "}
                <span>({t(`ckd.sources.${d.reglages[r.cle].s}`)})</span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <BlocDecision p={p} type={type} decideur={decideur} arret={arret} nouveauHandle={nouveauHandle} />
    </div>
  );
}

/**
 * Les boutons tant que rien n'est décidé (un clic ouvre la confirmation, avec
 * une note facultative), puis ce que la décision est devenue : compte créé,
 * arrêt prévu ou fait, envoi au HM, Done.
 */
function BlocDecision({
  p,
  type,
  decideur,
  arret,
  nouveauHandle,
}: {
  p: PropositionCkd;
  type: TypeControle;
  decideur?: PersonneCkd;
  arret?: ArretCkd;
  nouveauHandle: string | null;
}) {
  const { t } = useTranslation();
  const date = useDate();
  const queryClient = useQueryClient();
  const [choix, setChoix] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const invalider = () => queryClient.invalidateQueries({ queryKey: CLE });
  const decider = useMutation({
    mutationFn: (bouton: string) => deciderCkd(p.id, DECISION_DU_BOUTON[bouton], note.trim() || null),
    onSuccess: () => {
      setChoix(null);
      setNote("");
    },
    onSettled: invalider,
  });
  const annuler = useMutation({ mutationFn: () => annulerCkd(p.id), onSettled: invalider });
  const heure = { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } as const;
  const erreur = decider.error ?? annuler.error;

  if (!p.decision) {
    return (
      <div className="space-y-2" data-testid={`decision-${p.donnees.handle}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {BOUTONS_PAR_REGLE[p.regle].map((b) => (
            <Button
              key={b}
              size="xs"
              variant={choix === b ? "default" : "outline"}
              disabled={decider.isPending}
              onClick={() => setChoix(choix === b ? null : b)}
            >
              {t(`ckd.boutons.${b}`)}
            </Button>
          ))}
          {enRetard(p, type) && <Badge variant="warning">{t("ckd.retard")}</Badge>}
        </div>
        {choix && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2 text-xs">
            <span>{t(`ckd.consequences.${DECISION_DU_BOUTON[choix]}`, { handle: p.donnees.handle })}</span>
            <Input
              className="h-7 max-w-xs text-xs"
              placeholder={t("ckd.notePlaceholder")}
              aria-label={t("ckd.note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button size="xs" loading={decider.isPending} onClick={() => decider.mutate(choix)}>
              {t("ckd.confirmer", { action: t(`ckd.boutons.${choix}`) })}
            </Button>
            <Button size="xs" variant="ghost" disabled={decider.isPending} onClick={() => setChoix(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        )}
        {(erreur || p.erreur) && (
          <p role="alert" className="text-xs text-destructive">
            {erreur ? messageErreur(erreur) : t("ckd.erreurPrecedente", { erreur: p.erreur })}
          </p>
        )}
      </div>
    );
  }

  const statut: string[] = [];
  if (creeUnCompte(p.decision)) {
    statut.push(p.nouveau_compte_id ? t("ckd.statut.compteCree", { handle: nouveauHandle ?? "…" }) : t("ckd.statut.compteAttente"));
  }
  if (arret && !arret.annule_at) {
    statut.push(
      arret.fait_at
        ? t("ckd.statut.arrete", { date: date(arret.fait_at, heure) })
        : t("ckd.statut.arretPrevu", { date: date(arret.prevu_at, heure) }),
    );
  }
  if (p.envoye_at) statut.push(t("ckd.statut.envoye", { date: date(p.envoye_at, heure) }));
  else if (aEnvoyer(p)) statut.push(t("ckd.statut.aEnvoyer"));
  if (p.fait_at) statut.push(t("ckd.statut.fait", { date: date(p.fait_at, heure) }));

  return (
    <div className="space-y-1 rounded-md border px-3 py-2 text-xs" data-testid={`decision-${p.donnees.handle}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{t(`ckd.boutons.${boutonDeLaDecision(p.decision)}`)}</Badge>
        <span className="text-muted-foreground">
          {t("ckd.decidePar", { nom: nomPersonne(decideur) || "?", date: date(p.decision_at, heure) })}
        </span>
        {p.nouveau_compte_id && (
          <Link to={`/admin/createurs/${p.nouveau_compte_id}`} className="underline-offset-2 hover:underline">
            @{nouveauHandle ?? "…"}
          </Link>
        )}
        {annulable(p, arret) && (
          <Button className="ml-auto" size="xs" variant="ghost" loading={annuler.isPending} onClick={() => annuler.mutate()}>
            {t("ckd.annuler")}
          </Button>
        )}
      </div>
      {statut.length > 0 && <p>{statut.join(" · ")}</p>}
      {p.note && <p className="text-muted-foreground">{t("ckd.noteValeur", { note: p.note })}</p>}
      {(erreur || p.erreur) && (
        <p role="alert" className="text-destructive">
          {erreur ? messageErreur(erreur) : p.erreur}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historique : ce que les décisions sont devenues (0329)
// ---------------------------------------------------------------------------

const VARIANTE_TENDANCE: Record<Tendance, "success" | "error" | "outline"> = {
  hausse: "success",
  baisse: "error",
  stable: "outline",
};

/**
 * Toutes les décisions des 12 dernières semaines et, sur les 2 semaines qui
 * suivent, les chiffres du compte gardé ou doublé, et du compte créé. Pour voir
 * si les seuils sont trop durs (les gardés remontent) ou trop mous.
 */
function VueHistorique() {
  const { t } = useTranslation();
  const historique = useQuery({ queryKey: [...CLE, "historique"], queryFn: () => listerHistorique(12) });
  const [filtre, setFiltre] = React.useState<DecisionCkd | "">("");
  const lignes = React.useMemo(() => historique.data ?? [], [historique.data]);
  const ids = React.useMemo(
    () => [...new Set(lignes.flatMap((h) => [h.poster_id, h.decision_par]).filter(Boolean))].sort() as string[],
    [lignes],
  );
  const personnes = useQuery({
    queryKey: [...CLE, "personnes", ids],
    queryFn: () => listerPersonnes(ids),
    enabled: ids.length > 0,
  });
  const parId = React.useMemo(
    () => new Map((personnes.data ?? []).map((p) => [p.id, p] as const)),
    [personnes.data],
  );
  const resume = resumerHistorique(lignes);
  const visibles = filtre ? lignes.filter((h) => h.decision === filtre) : lignes;

  if (historique.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(historique.error)}
      </p>
    );
  }
  return (
    <Card data-testid="vue-historique">
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.historique.titre")}</CardTitle>
        <CardDescription>{t("ckd.historique.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {historique.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : lignes.length === 0 ? (
          <EmptyState title={t("ckd.historique.vide")} />
        ) : (
          <>
            <ul className="space-y-0.5 text-xs" data-testid="resume-historique">
              {resume.map((r) => (
                <li key={r.decision}>
                  <span className="font-medium">{t(`ckd.decisions.${r.decision}`)}</span> :{" "}
                  {t("ckd.historique.resume", { ...r })}
                </li>
              ))}
            </ul>
            <select
              className={selectClass}
              aria-label={t("ckd.historique.filtre")}
              value={filtre}
              onChange={(e) => setFiltre(e.target.value as DecisionCkd | "")}
            >
              <option value="">{t("ckd.historique.toutes", { n: lignes.length })}</option>
              {resume.map((r) => (
                <option key={r.decision} value={r.decision}>
                  {t(`ckd.decisions.${r.decision}`)} ({r.total})
                </option>
              ))}
            </select>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t("ckd.historique.colonnes.decision")}</th>
                    <th className="py-1 pr-3 font-medium">{t("ckd.historique.colonnes.compte")}</th>
                    <th className="py-1 pr-3 font-medium">{t("ckd.historique.colonnes.avant")}</th>
                    <th className="py-1 pr-3 font-medium">{t("ckd.historique.colonnes.apres")}</th>
                    <th className="py-1 pr-3 font-medium">{t("ckd.historique.colonnes.nouveau")}</th>
                    <th className="py-1 font-medium">{t("ckd.historique.colonnes.tendance")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibles.map((h) => (
                    <LigneHistorique key={h.id} h={h} poster={parId.get(h.poster_id)} decideur={h.decision_par ? parId.get(h.decision_par) : undefined} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Chiffres({ c }: { c: ChiffresCkd }) {
  const { t } = useTranslation();
  return (
    <span className="tabular-nums">
      {c.mediane !== null && c.mediane !== undefined ? t("ckd.historique.mediane", { n: c.mediane.toLocaleString() }) : "—"}
      {" · "}
      {t("ckd.historique.publies", { publies: c.publies ?? 0, attendus: c.attendus ?? 0 })}
      {c.bons ? ` · ${t("ckd.historique.bons", { n: c.bons })}` : ""}
    </span>
  );
}

function LigneHistorique({ h, poster, decideur }: { h: HistoriqueCkd; poster?: PersonneCkd; decideur?: PersonneCkd }) {
  const { t } = useTranslation();
  const date = useDate();
  const tend = tendanceDecision(h);
  const pasCommence = !h.apres && !h.apres_nouveau && !h.arrete_at;
  return (
    <tr className="align-top" data-testid={`historique-${h.handle}`}>
      <td className="py-1.5 pr-3">
        <Badge variant="outline">{t(`ckd.decisions.${h.decision}`)}</Badge>
        <div className="mt-0.5 text-muted-foreground">
          {t("ckd.historique.decide", { date: date(h.decision_at ?? h.jour), nom: nomPersonne(decideur) || "?" })}
        </div>
        {h.note && <div className="text-muted-foreground italic">{h.note}</div>}
      </td>
      <td className="py-1.5 pr-3">
        <Link to={`/admin/createurs/${h.compte_id}`} className="underline-offset-2 hover:underline">
          {drapeauPays(h.pays)} @{h.handle}
        </Link>
        <div className="text-muted-foreground">
          {[nomPersonne(poster), t(`ckd.reglesCourtes.${h.regle}`)].filter(Boolean).join(" · ")}
        </div>
      </td>
      <td className="py-1.5 pr-3">
        <Chiffres c={h.avant} />
        {h.mediane_ref !== null && (
          <div className="text-muted-foreground">{t("ckd.historique.reference", { n: h.mediane_ref.toLocaleString() })}</div>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {h.arrete_at ? (
          <span className="text-muted-foreground">{t("ckd.historique.arrete", { date: date(h.arrete_at) })}</span>
        ) : pasCommence ? (
          <span className="text-muted-foreground">{t("ckd.historique.commence", { date: date(h.du) })}</span>
        ) : (
          h.apres && <Chiffres c={h.apres} />
        )}
        {!pasCommence && !h.complet && (
          <div className="text-muted-foreground">{t("ckd.historique.enCours", { date: date(h.au) })}</div>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {h.nouveau_compte_id ? (
          <>
            <Link to={`/admin/createurs/${h.nouveau_compte_id}`} className="underline-offset-2 hover:underline">
              @{h.nouveau_handle ?? "…"}
            </Link>
            {h.apres_nouveau && (
              <div>
                <Chiffres c={h.apres_nouveau} />
              </div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-1.5">
        {tend ? (
          <Badge variant={VARIANTE_TENDANCE[tend]}>
            {t(`ckd.historique.tendances.${tend}`)}
            {!h.complet && " *"}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

function VueReglages() {
  const { t } = useTranslation();
  const reglages = useQuery({ queryKey: [...CLE, "reglages"], queryFn: listerReglages });
  const part = useQuery({ queryKey: [...CLE, "part-bons-posts"], queryFn: lirePartBonsPosts });
  const labels = useQuery({ queryKey: [...CLE, "labels"], queryFn: listerLabels });
  const erreur = reglages.error ?? part.error ?? labels.error;
  const pays = React.useMemo(
    () => [...(part.data ?? [])].sort((a, b) => b.posts - a.posts).map((l) => l.pays),
    [part.data],
  );

  if (erreur) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(erreur)}
      </p>
    );
  }
  if (!reglages.data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  return (
    <div className="space-y-5" data-testid="vue-reglages">
      <CarteDefauts reglages={reglages.data} />
      <CartePays reglages={reglages.data} pays={pays} />
      <CarteExceptions reglages={reglages.data} labels={labels.data ?? []} pays={pays} />
      <CartePartBons />
      <CarteCanalSlack />
      <CarteSlack />
      <CarteTextesNudges />
      <CarteJournal labels={labels.data ?? []} />
    </div>
  );
}

function useRegler() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { cle: string; pays: string | null; labelId: string | null; valeur: unknown }) =>
      reglerCkd(v.cle, v.pays, v.labelId, v.valeur),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
}

/**
 * Une case de réglage : affiche la valeur qui s'applique (grisée si elle est
 * héritée), se modifie au clic. Vide + Entrée = retirer l'exception.
 */
function CelluleReglage({
  def,
  reglages,
  pays,
  labelId,
}: {
  def: DefReglage;
  reglages: ReglageCkd[];
  pays: string | null;
  labelId: string | null;
}) {
  const { t } = useTranslation();
  const regler = useRegler();
  const [edition, setEdition] = React.useState(false);
  const [texte, setTexte] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);

  const propre = reglageDuNiveau(reglages, def.cle, pays, labelId);
  const effective = valeurEffective(reglages, def.cle, pays, labelId);
  const herite = !propre;
  const affichage =
    def.cle === "seuil_bon_post" && (effective?.valeur ?? null) === null
      ? t("ckd.commentMasters")
      : formaterValeur(def, effective?.valeur, t("ckd.oui"), t("ckd.non"));
  const niveauDefaut = pays === null && labelId === null;

  const ouvrir = () => {
    setTexte(propre ? valeurEnSaisie(def, propre.valeur) : "");
    setErreur(null);
    setEdition(true);
  };
  const valider = () => {
    const lu = lireSaisie(def, texte);
    if ("erreur" in lu) {
      setErreur(t(`ckd.erreursSaisie.${lu.erreur}`));
      return;
    }
    if (lu.valeur === null && niveauDefaut && !def.videAutorise) {
      setErreur(t("ckd.erreursSaisie.defautRequis"));
      return;
    }
    regler.mutate(
      { cle: def.cle, pays, labelId, valeur: lu.valeur },
      { onSuccess: () => setEdition(false), onError: (e) => setErreur(messageErreur(e)) },
    );
  };

  if (edition) {
    return (
      <div className="space-y-1">
        <Input
          autoFocus
          className="h-7 w-24 text-xs"
          value={texte}
          placeholder={def.type === "oui_non" ? t("ckd.ouiNon") : def.type === "part" ? "%" : ""}
          aria-label={t(`ckd.reglages.${def.cle}`)}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") valider();
            if (e.key === "Escape") setEdition(false);
          }}
          onBlur={() => {
            if (!regler.isPending) setEdition(false);
          }}
        />
        {erreur && <p className="text-[11px] text-destructive">{erreur}</p>}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={ouvrir}
      className={cn(
        "rounded px-1.5 py-0.5 text-left text-xs tabular-nums hover:bg-accent",
        herite ? "text-muted-foreground" : "font-semibold text-foreground",
      )}
      title={herite ? t("ckd.herite") : t("ckd.remplace")}
    >
      {affichage}
    </button>
  );
}

function CarteDefauts({ reglages }: { reglages: ReglageCkd[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.defauts")}</CardTitle>
        <CardDescription>{t("ckd.defautsAide")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {REGLAGES.map((r) => (
            <div key={r.cle} className="flex items-center justify-between gap-3">
              <dt className="text-sm">{t(`ckd.reglages.${r.cle}`)}</dt>
              <dd>
                <CelluleReglage def={r} reglages={reglages} pays={null} labelId={null} />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function CartePays({ reglages, pays }: { reglages: ReglageCkd[]; pays: string[] }) {
  const { t } = useTranslation();
  const colonnes = REGLAGES.filter((r) => !r.global);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.parPays")}</CardTitle>
        <CardDescription>{t("ckd.parPaysAide")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-medium">{t("ckd.pays")}</th>
              {colonnes.map((r) => (
                <th key={r.cle} className="py-1 pr-2 font-medium">
                  {t(`ckd.reglagesCourts.${r.cle}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {pays.map((code) => (
              <tr key={code}>
                <td className="whitespace-nowrap py-1 pr-2">
                  {drapeauPays(code)} {code}
                </td>
                {colonnes.map((r) => (
                  <td key={r.cle} className="py-0.5 pr-2">
                    <CelluleReglage def={r} reglages={reglages} pays={code} labelId={null} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CarteExceptions({ reglages, labels, pays }: { reglages: ReglageCkd[]; labels: LabelCkd[]; pays: string[] }) {
  const { t } = useTranslation();
  const regler = useRegler();
  const [label, setLabel] = React.useState("");
  const [codePays, setCodePays] = React.useState("");
  const [cle, setCle] = React.useState(REGLAGES[0].cle);
  const [texte, setTexte] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const labelParId = new Map(labels.map((l) => [l.id, l] as const));
  const exceptions = exceptionsLabel(reglages);
  const choix = REGLAGES.filter((r) => !r.global);

  const ajouter = () => {
    const def = defReglage(cle);
    if (!def || !label) return;
    const lu = lireSaisie(def, texte);
    if ("erreur" in lu || lu.valeur === null) {
      setErreur(t(`ckd.erreursSaisie.${"erreur" in lu ? lu.erreur : "nombre"}`));
      return;
    }
    setErreur(null);
    regler.mutate(
      { cle, pays: codePays || null, labelId: label, valeur: lu.valeur },
      { onSuccess: () => setTexte(""), onError: (e) => setErreur(messageErreur(e)) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.exceptions")}</CardTitle>
        <CardDescription>{t("ckd.exceptionsAide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ckd.aucuneException")}</p>
        ) : (
          <ul className="divide-y text-sm">
            {exceptions.map((r) => {
              const def = defReglage(r.cle);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <Badge variant="outline">{labelParId.get(r.label_id ?? "")?.nom ?? r.label_id}</Badge>
                  <span>{r.pays ? `${drapeauPays(r.pays)} ${r.pays}` : t("ckd.tousPays")}</span>
                  <span className="text-muted-foreground">{t(`ckd.reglages.${r.cle}`)}</span>
                  <span className="font-semibold">{formaterValeur(def, r.valeur, t("ckd.oui"), t("ckd.non"))}</span>
                  <Button
                    className="ml-auto"
                    size="xs"
                    variant="ghost"
                    onClick={() => regler.mutate({ cle: r.cle, pays: r.pays, labelId: r.label_id, valeur: null })}
                  >
                    {t("common.delete")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <select className={selectClass} aria-label={t("ckd.label")} value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="">{t("ckd.choisirLabel")}</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
          <select className={selectClass} aria-label={t("ckd.pays")} value={codePays} onChange={(e) => setCodePays(e.target.value)}>
            <option value="">{t("ckd.tousPays")}</option>
            {pays.map((p) => (
              <option key={p} value={p}>
                {drapeauPays(p)} {p}
              </option>
            ))}
          </select>
          <select className={selectClass} aria-label={t("ckd.reglage")} value={cle} onChange={(e) => setCle(e.target.value)}>
            {choix.map((r) => (
              <option key={r.cle} value={r.cle}>
                {t(`ckd.reglages.${r.cle}`)}
              </option>
            ))}
          </select>
          <Input
            className="h-8 w-28"
            value={texte}
            placeholder={t("ckd.valeur")}
            aria-label={t("ckd.valeur")}
            onChange={(e) => setTexte(e.target.value)}
          />
          <Button size="sm" disabled={!label || regler.isPending} onClick={ajouter}>
            {t("ckd.ajouterException")}
          </Button>
        </div>
        {erreur && <p className="text-xs text-destructive">{erreur}</p>}
      </CardContent>
    </Card>
  );
}

function CartePartBons() {
  const { t } = useTranslation();
  const part = useQuery({ queryKey: [...CLE, "part-bons-posts"], queryFn: lirePartBonsPosts });
  const lignes = [...(part.data ?? [])].sort((a, b) => b.posts - a.posts);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.partBons")}</CardTitle>
        <CardDescription>{t("ckd.partBonsAide")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">{t("ckd.pays")}</th>
              <th className="py-1 pr-3 text-right font-medium">{t("ckd.seuilBon")}</th>
              <th className="py-1 pr-3 text-right font-medium">{t("ckd.posts")}</th>
              <th className="py-1 pr-3 text-right font-medium">{t("ckd.auDessus")}</th>
              <th className="py-1 text-right font-medium">{t("ckd.medianePays")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lignes.map((l) => {
              const pct = pourcentage(l.au_dessus, l.posts);
              return (
                <tr key={l.pays}>
                  <td className="py-1 pr-3">
                    {drapeauPays(l.pays)} {nomPaysIso(l.pays)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {l.seuil.toLocaleString()} <span className="text-muted-foreground">({t(`ckd.sources.${l.source}`)})</span>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{l.posts.toLocaleString()}</td>
                  <td className={cn("py-1 pr-3 text-right tabular-nums", (pct < 3 || pct > 12) && "text-warning-foreground")}>
                    {pct.toLocaleString()} %
                  </td>
                  <td className="py-1 text-right tabular-nums">{(l.mediane ?? 0).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LigneSlack({ hm }: { hm: HmCkd }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [texte, setTexte] = React.useState(hm.slack_user_id ?? "");
  const enregistrer = useMutation({
    mutationFn: () => enregistrerSlackHm(hm.profile_id, texte.trim() || null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE, "hms"] }),
  });
  const valide = texte.trim() === "" || /^[UW][A-Z0-9]{6,}$/.test(texte.trim());
  const change = texte.trim() !== (hm.slack_user_id ?? "");
  return (
    <tr>
      <td className="py-1 pr-3">{hm.nom}</td>
      <td className="py-1 pr-3 text-muted-foreground">{hm.zone ?? "—"}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{hm.posters}</td>
      <td className="py-1">
        <div className="flex items-center gap-2">
          <Input
            className={cn("h-7 w-36 font-mono text-xs", !valide && "border-destructive")}
            value={texte}
            placeholder="U0…"
            aria-label={t("ckd.slackDe", { nom: hm.nom })}
            onChange={(e) => setTexte(e.target.value.toUpperCase())}
          />
          {change && (
            <Button size="xs" disabled={!valide} loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
              {t("common.save")}
            </Button>
          )}
          {!hm.slack_user_id && !change && <Badge variant="warning">{t("ckd.slackManquant")}</Badge>}
          {enregistrer.error && <span className="text-destructive">{messageErreur(enregistrer.error)}</span>}
        </div>
      </td>
    </tr>
  );
}

/** Le canal des décisions (#managers-hq) et la vérification du bot, sans rien poster. */
function CarteCanalSlack() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canal = useQuery({ queryKey: [...CLE, "canal-slack"], queryFn: lireCanalSlack });
  const [saisie, setSaisie] = React.useState<string | null>(null);
  const enregistrer = useMutation({
    mutationFn: (v: string) => enregistrerCanalSlack(v),
    onSuccess: () => setSaisie(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE, "canal-slack"] }),
  });
  const verifier = useMutation({ mutationFn: verifierSlackCkd });
  const valeur = saisie ?? canal.data ?? "";
  const valide = /^[CG][A-Z0-9]{6,}$/.test(valeur.trim());
  const v = verifier.data;
  return (
    <Card data-testid="carte-canal-slack">
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.canalSlack")}</CardTitle>
        <CardDescription>{t("ckd.canalSlackAide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-48 font-mono text-xs"
            aria-label={t("ckd.canalSlack")}
            value={valeur}
            onChange={(e) => setSaisie(e.target.value.toUpperCase())}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={saisie === null || !valide}
            loading={enregistrer.isPending}
            onClick={() => enregistrer.mutate(valeur)}
          >
            {t("common.save")}
          </Button>
          <Button size="sm" variant="outline" loading={verifier.isPending} onClick={() => verifier.mutate()}>
            {t("ckd.verifierSlack")}
          </Button>
        </div>
        {v && (
          <p role="status" className={cn(v.ok ? "text-success-foreground" : "text-destructive")}>
            {v.ok
              ? t("ckd.slackOk", { bot: v.bot, nom: v.nom ?? v.canal })
              : v.membre === false
                ? t("ckd.slackPasMembre", { bot: v.bot, nom: v.nom ?? v.canal })
                : t("ckd.slackKo", { erreur: v.error })}
          </p>
        )}
        {(verifier.error || enregistrer.error) && (
          <p role="alert" className="text-destructive">{messageErreur(verifier.error ?? enregistrer.error)}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Les textes des nudges (en anglais, ce que lit le posteur). `{handle}` = son compte. */
function CarteTextesNudges() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const textes = useQuery({ queryKey: [...CLE, "textes-nudges"], queryFn: lireTextesNudges });
  const [brouillon, setBrouillon] = React.useState<TextesNudges | null>(null);
  const enregistrer = useMutation({
    mutationFn: (v: TextesNudges) => enregistrerTextesNudges(v),
    onSuccess: () => setBrouillon(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE, "textes-nudges"] }),
  });
  const courant = brouillon ?? textes.data ?? {};
  const changer = (m: (typeof MOTIFS_NUDGE)[number], champ: "titre" | "corps", v: string) =>
    setBrouillon({ ...courant, [m]: { titre: courant[m]?.titre ?? "", corps: courant[m]?.corps ?? "", [champ]: v } });
  return (
    <Card data-testid="carte-textes-nudges">
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.textesNudges")}</CardTitle>
        <CardDescription>{t("ckd.textesNudgesAide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {MOTIFS_NUDGE.map((m) => (
          <div key={m} className="space-y-1">
            <p className="font-medium">{t(`ckd.motifsNudge.${m}`)}</p>
            <Input
              className="h-8 text-xs"
              aria-label={t("ckd.titreNudge", { motif: t(`ckd.motifsNudge.${m}`) })}
              value={courant[m]?.titre ?? ""}
              onChange={(e) => changer(m, "titre", e.target.value)}
            />
            <textarea
              className="min-h-16 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
              aria-label={t("ckd.corpsNudge", { motif: t(`ckd.motifsNudge.${m}`) })}
              value={courant[m]?.corps ?? ""}
              onChange={(e) => changer(m, "corps", e.target.value)}
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!brouillon}
            loading={enregistrer.isPending}
            onClick={() => brouillon && enregistrer.mutate(brouillon)}
          >
            {t("common.save")}
          </Button>
          {brouillon && (
            <Button size="sm" variant="ghost" onClick={() => setBrouillon(null)}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
        {(textes.error || enregistrer.error) && (
          <p role="alert" className="text-destructive">{messageErreur(textes.error ?? enregistrer.error)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CarteSlack() {
  const { t } = useTranslation();
  const hms = useQuery({ queryKey: [...CLE, "hms"], queryFn: listerHms });
  const lignes = [...(hms.data ?? [])].sort((a, b) => b.posters - a.posters);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.slackHms")}</CardTitle>
        <CardDescription>{t("ckd.slackHmsAide")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {hms.error && <p className="text-xs text-destructive">{messageErreur(hms.error)}</p>}
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">{t("ckd.hm")}</th>
              <th className="py-1 pr-3 font-medium">{t("ckd.zone")}</th>
              <th className="py-1 pr-3 text-right font-medium">{t("ckd.posters")}</th>
              <th className="py-1 font-medium">{t("ckd.idSlack")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lignes.map((h) => (
              <LigneSlack key={`${h.profile_id}-${h.slack_user_id ?? ""}`} hm={h} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CarteJournal({ labels }: { labels: LabelCkd[] }) {
  const { t } = useTranslation();
  const date = useDate();
  const journal = useQuery({ queryKey: [...CLE, "journal"], queryFn: listerJournal });
  const auteurs = React.useMemo(
    () => [...new Set((journal.data ?? []).map((j) => j.par).filter((p): p is string => Boolean(p)))].sort(),
    [journal.data],
  );
  const personnes = useQuery({
    queryKey: [...CLE, "personnes", auteurs],
    queryFn: () => listerPersonnes(auteurs),
    enabled: auteurs.length > 0,
  });
  const nom = new Map((personnes.data ?? []).map((p) => [p.id, nomPersonne(p)] as const));
  const labelParId = new Map(labels.map((l) => [l.id, l.nom] as const));
  const lignes = journal.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("ckd.journal")}</CardTitle>
      </CardHeader>
      <CardContent>
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ckd.journalVide")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {lignes.map((j) => {
              const def = defReglage(j.cle);
              const niveau = [j.pays, j.label_id ? labelParId.get(j.label_id) : null].filter(Boolean).join(" × ") || t("ckd.niveauDefaut");
              return (
                <li key={j.id}>
                  <span className="text-muted-foreground">
                    {date(j.at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>{" "}
                  {j.par ? nom.get(j.par) ?? "" : t("ckd.systeme")} · {t(`ckd.reglages.${j.cle}`)} ({niveau}) :{" "}
                  {formaterValeur(def, j.ancienne, t("ckd.oui"), t("ckd.non"))} → {formaterValeur(def, j.nouvelle, t("ckd.oui"), t("ckd.non"))}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
