import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Swords, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { formaterNombre, formaterPart, formaterVues, messageErreur } from "@/features/bleo/format";
import { localeDate } from "@/locales/localeDate";

const dateCourte = (iso: string, langue: string) =>
  new Date(iso).toLocaleDateString(localeDate(langue), { day: "numeric", month: "short" });

import {
  choixDepuisCote,
  decksAffiches,
  decompteVotes,
  type Duel,
  envoyerAuxRelecteurs,
  listerCircuits,
  listerDuels,
  listerVotesRelecteurs,
  preparerDuel,
  type RapportVotes,
  rapportVotesRelecteurs,
  verdictCandidat,
  type VoteRelecteur,
  voterDuel,
} from "./api";
import { TableDuel } from "./TableDuel";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const DUELS_PAR_LOT = 5;

/**
 * A/B de la traduction et du placement (0620), dans Tests seulement : le duel
 * à l'aveugle sur des slideshows déjà publiés, le deck parti contre celui d'un
 * nouveau circuit. Rien ne part en production (décision d'Adrien, 30/10).
 * Depuis 0626, l'admin peut envoyer un duel aux relecteurs natifs de la
 * langue, qui votent et notent depuis leur espace ; leurs votes et remarques
 * se lisent ici, et le candidat relit les remarques pour s'améliorer.
 */
export function AbTraductionCard() {
  return <CarteDuels />;
}

function CarteDuels() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [langue, setLangue] = React.useState("de");
  const [candidatId, setCandidatId] = React.useState("");
  const [avance, setAvance] = React.useState<{ faits: number; total: number; message: string | null } | null>(null);

  const circuits = useQuery({ queryKey: ["ab-traduction", "circuits"], queryFn: listerCircuits });
  const candidat = circuits.data?.find((c) => c.id === candidatId) ?? circuits.data?.[0] ?? null;
  const cleDuels = ["ab-traduction", "duels", langue, candidat?.id, candidat?.version];
  const duels = useQuery({
    queryKey: cleDuels,
    queryFn: () => listerDuels(langue, candidat!.id, candidat!.version),
    enabled: Boolean(candidat),
  });
  const liste = duels.data ?? [];
  const prets = liste.filter((d) => d.statut === "pret");
  const cleVotes = [...cleDuels, "votes", prets.map((d) => d.id).join(",")];
  const votesRelecteurs = useQuery({
    queryKey: cleVotes,
    queryFn: () => listerVotesRelecteurs(prets.map((d) => d.id)),
    enabled: prets.length > 0,
  });
  const cleRapport = ["ab-traduction", "votes-rapport", langue];
  const rapport = useQuery({ queryKey: cleRapport, queryFn: () => rapportVotesRelecteurs(langue) });
  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: cleDuels });
    void queryClient.invalidateQueries({ queryKey: cleRapport });
  };

  const preparer = useMutation({
    mutationFn: async () => {
      if (!candidat) return;
      for (let i = 0; i < DUELS_PAR_LOT; i++) {
        setAvance({ faits: i, total: DUELS_PAR_LOT, message: null });
        const r = await preparerDuel(langue, candidat.id);
        void queryClient.invalidateQueries({ queryKey: cleDuels });
        if (!r.ok && /plus de slideshow/.test(r.raison ?? "")) {
          setAvance({ faits: i, total: DUELS_PAR_LOT, message: r.raison ?? null });
          return;
        }
        if (!r.ok) setAvance({ faits: i + 1, total: DUELS_PAR_LOT, message: r.raison ?? null });
      }
      setAvance((a) => ({ faits: DUELS_PAR_LOT, total: DUELS_PAR_LOT, message: a?.message ?? null }));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: cleDuels }),
  });

  const nonEnvoyes = prets.filter((d) => !d.relecteurs_le);
  const envoyerTous = useMutation({
    mutationFn: () => envoyerAuxRelecteurs(nonEnvoyes.map((d) => d.id), true),
    onSuccess: rafraichir,
  });

  const aVoter = prets.filter((d) => !d.choix);
  const votes = prets.filter((d) => d.choix);
  const echecs = liste.filter((d) => d.statut === "echec").length;
  const compte = (c: string) => votes.filter((d) => d.choix === c).length;
  const votesDuDuel = (id: string) => (votesRelecteurs.data ?? []).filter((v) => v.duel_id === id);
  const ligneRapport = (rapport.data ?? []).find((r) => r.candidat === candidat?.id && r.version === candidat?.version) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="size-4 text-primary" />
          {t("abTraduction.duels.titre")}
        </CardTitle>
        <CardDescription>{t("abTraduction.duels.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="abDuelLangue">{t("tests.langue")}</Label>
            <select id="abDuelLangue" className={selectClass} value={langue} onChange={(e) => setLangue(e.target.value)}>
              {LANGUES_CIBLES.map((l) => (
                <option key={l} value={l}>
                  {nomLangue(l)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="abDuelCandidat">{t("abTraduction.duels.candidat")}</Label>
            <select
              id="abDuelCandidat"
              className={selectClass}
              value={candidat?.id ?? ""}
              onChange={(e) => setCandidatId(e.target.value)}
            >
              {(circuits.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.version})
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => preparer.mutate()} disabled={!candidat || preparer.isPending}>
            {preparer.isPending && avance
              ? t("abTraduction.duels.enCours", { faits: avance.faits, total: avance.total })
              : t("abTraduction.duels.preparer", { n: DUELS_PAR_LOT })}
          </Button>
        </div>
        {candidat?.applications && (
          <p className="text-xs text-muted-foreground">
            {t("abTraduction.duels.applis", { applis: candidat.applications.join(", ") })}
          </p>
        )}
        {avance?.message && <p className="text-xs text-muted-foreground">{avance.message}</p>}
        {(circuits.error ?? duels.error ?? preparer.error ?? envoyerTous.error ?? votesRelecteurs.error ?? rapport.error) && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(circuits.error ?? duels.error ?? preparer.error ?? envoyerTous.error ?? votesRelecteurs.error ?? rapport.error)}
          </p>
        )}

        <p className="text-sm">
          {votes.length === 0
            ? t("abTraduction.duels.aucunVote", { prets: prets.length })
            : t("abTraduction.duels.decompte", {
                votes: votes.length,
                candidat: compte("candidat"),
                actuel: compte("actuel"),
                egal: compte("egal"),
              })}
          {echecs > 0 && <span className="text-muted-foreground"> · {t("abTraduction.duels.echecs", { n: echecs })}</span>}
        </p>

        <BlocRelecteurs rapport={ligneRapport} nonEnvoyes={nonEnvoyes.length} envoyer={() => envoyerTous.mutate()} enCours={envoyerTous.isPending} />

        {aVoter.map((d) => (
          <CarteDuel key={d.id} duel={d} votesRelecteurs={votesDuDuel(d.id)} rafraichir={rafraichir} cleDuels={cleDuels} />
        ))}
        {votes.length > 0 && (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("abTraduction.duels.votes", { n: votes.length })}
            </summary>
            <div className="mt-3 space-y-4">
              {votes.map((d) => (
                <CarteDuel key={d.id} duel={d} votesRelecteurs={votesDuDuel(d.id)} rafraichir={rafraichir} cleDuels={cleDuels} />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

/** Les relecteurs natifs : envoi groupé, décompte de leurs votes, verdict D8, remarques. */
function BlocRelecteurs({
  rapport,
  nonEnvoyes,
  envoyer,
  enCours,
}: {
  rapport: RapportVotes | null;
  nonEnvoyes: number;
  envoyer: () => void;
  enCours: boolean;
}) {
  const { t, i18n } = useTranslation();
  const verdict = rapport ? verdictCandidat(rapport) : null;
  const tonVerdict = verdict === "retenu" ? "success" : verdict === "ecarte" ? "warning" : "outline";

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm" data-testid="ab-relecteurs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          {t("abTraduction.duels.relecteurs.titre")}
        </p>
        <Button size="sm" variant="outline" disabled={nonEnvoyes === 0 || enCours} onClick={envoyer}>
          {t("abTraduction.duels.relecteurs.envoyerTous", { n: nonEnvoyes })}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("abTraduction.duels.relecteurs.aide")}</p>
      {rapport ? (
        <div className="space-y-1">
          <p>
            {t("abTraduction.duels.relecteurs.envoyes", { duels: rapport.duels_envoyes, votes: rapport.votes, relecteurs: rapport.relecteurs })}
            {rapport.votes > 0 && (
              <>
                {" · "}
                {t("abTraduction.duels.decompte", {
                  votes: rapport.votes,
                  candidat: rapport.candidat_gagne,
                  actuel: rapport.actuel_gagne,
                  egal: rapport.egal,
                })}
              </>
            )}
          </p>
          {rapport.votes > 0 && (
            <p className="flex flex-wrap items-center gap-2">
              {rapport.part_candidat != null && <span>{t("abTraduction.duels.relecteurs.part", { part: formaterPart(rapport.part_candidat) })}</span>}
              {verdict && <Badge variant={tonVerdict}>{t(`abTraduction.duels.relecteurs.verdict_${verdict}`)}</Badge>}
              {(rapport.note_actuel != null || rapport.note_candidat != null) && (
                <span className="text-muted-foreground">
                  {t("abTraduction.duels.relecteurs.notes", {
                    actuel: formaterNombre(rapport.note_actuel, 1),
                    candidat: formaterNombre(rapport.note_candidat, 1),
                  })}
                </span>
              )}
            </p>
          )}
          {Object.keys(rapport.types_erreur).length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("abTraduction.duels.relecteurs.types")}
              {": "}
              {Object.entries(rapport.types_erreur)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => `${t(`relectureNative.poster.duels.types.${k}`)} ${n}`)
                .join(" · ")}
            </p>
          )}
          {rapport.remarques.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-medium">
                {t("abTraduction.duels.relecteurs.remarques", { n: rapport.remarques.length })}
              </summary>
              <ul className="mt-1 space-y-1 text-xs">
                {rapport.remarques.map((r, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">
                      {dateCourte(r.le, i18n.language)}
                      {r.sur && ` · ${t(`abTraduction.duels.relecteurs.sur_${r.sur}`)}`}
                      {r.type && ` · ${t(`relectureNative.poster.duels.types.${r.type}`)}`}
                      {" : "}
                    </span>
                    {r.remarque}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("abTraduction.duels.relecteurs.rien")}</p>
      )}
    </div>
  );
}

function CarteDuel({
  duel,
  votesRelecteurs,
  rafraichir,
  cleDuels,
}: {
  duel: Duel;
  votesRelecteurs: VoteRelecteur[];
  rafraichir: () => void;
  cleDuels: unknown[];
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [remarque, setRemarque] = React.useState(duel.remarque ?? "");
  const voter = useMutation({
    mutationFn: (cote: "gauche" | "droite" | "egal") => voterDuel(duel.id, choixDepuisCote(duel, cote), remarque),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: cleDuels }),
  });
  const envoyer = useMutation({
    mutationFn: (envoyer: boolean) => envoyerAuxRelecteurs([duel.id], envoyer),
    onSuccess: rafraichir,
  });
  const [gauche, droite] = decksAffiches(duel);
  const revele = duel.choix !== null;
  const nomCote = (cote: "gauche" | "droite") => {
    if (!revele) return t(`abTraduction.duels.${cote}`);
    const qui = cote === "gauche" ? duel.gauche : duel.gauche === "actuel" ? "candidat" : "actuel";
    return `${t(`abTraduction.duels.${cote}`)} · ${t(`abTraduction.duels.qui_${qui}`)}`;
  };
  const decompte = decompteVotes(votesRelecteurs);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <TableDuel source={duel.slides_source} gauche={gauche} droite={droite} titreGauche={nomCote("gauche")} titreDroite={nomCote("droite")} />
      <div className="flex flex-wrap items-center gap-2">
        {revele ? (
          <span className="text-sm">
            {t("abTraduction.duels.choix", { choix: t(`abTraduction.duels.choix_${duel.choix}`) })}
            {duel.vues_actuel != null && (
              <span className="text-muted-foreground">
                {" · "}
                {t("abTraduction.duels.vuesActuel", { vues: formaterVues(duel.vues_actuel, i18n.language) })}
              </span>
            )}
            {duel.voie_cta && (
              <span className="text-muted-foreground">
                {" · "}
                {t("abTraduction.duels.cta", { voie: duel.voie_cta, forme: duel.forme_cta ?? "—" })}
                {duel.cta_refus && ` (${t("abTraduction.duels.refus", { raison: duel.cta_refus })})`}
              </span>
            )}
            {duel.remarque && <span className="text-muted-foreground"> · {duel.remarque}</span>}
          </span>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={voter.isPending} onClick={() => voter.mutate("gauche")}>
              {t("abTraduction.duels.voterGauche")}
            </Button>
            <Button size="sm" variant="outline" disabled={voter.isPending} onClick={() => voter.mutate("egal")}>
              {t("abTraduction.duels.voterEgal")}
            </Button>
            <Button size="sm" variant="outline" disabled={voter.isPending} onClick={() => voter.mutate("droite")}>
              {t("abTraduction.duels.voterDroite")}
            </Button>
            <Input
              className="h-8 min-w-48 flex-1"
              placeholder={t("abTraduction.duels.remarque")}
              value={remarque}
              onChange={(e) => setRemarque(e.target.value)}
            />
          </>
        )}
        {duel.post_id && (
          <Link className="text-xs text-primary underline-offset-2 hover:underline" to={`/admin/posts/${duel.post_id}`}>
            {t("abTraduction.duels.voirPost")}
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {duel.relecteurs_le ? (
          <>
            <Badge variant="info">{t("abTraduction.duels.relecteurs.envoyeLe", { date: dateCourte(duel.relecteurs_le, i18n.language) })}</Badge>
            <span className="text-muted-foreground">
              {decompte.votes === 0
                ? t("abTraduction.duels.relecteurs.aucunVote")
                : t("abTraduction.duels.relecteurs.votesDuel", {
                    votes: decompte.votes,
                    candidat: decompte.candidat,
                    actuel: decompte.actuel,
                    egal: decompte.egal,
                  })}
              {(decompte.noteActuel != null || decompte.noteCandidat != null) &&
                ` · ${t("abTraduction.duels.relecteurs.notes", {
                  actuel: formaterNombre(decompte.noteActuel, 1),
                  candidat: formaterNombre(decompte.noteCandidat, 1),
                })}`}
            </span>
            <Button size="xs" variant="ghost" disabled={envoyer.isPending} onClick={() => envoyer.mutate(false)}>
              {t("abTraduction.duels.relecteurs.retirer")}
            </Button>
          </>
        ) : (
          <Button size="xs" variant="outline" disabled={envoyer.isPending} onClick={() => envoyer.mutate(true)}>
            {t("abTraduction.duels.relecteurs.envoyer")}
          </Button>
        )}
      </div>
      {(voter.error ?? envoyer.error) && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(voter.error ?? envoyer.error)}
        </p>
      )}
    </div>
  );
}
