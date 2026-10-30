import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Swords } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { formaterVues, messageErreur } from "@/features/bleo/format";

import {
  choixDepuisCote,
  decksAffiches,
  type Duel,
  listerCircuits,
  listerDuels,
  preparerDuel,
  type SlideDuel,
  voterDuel,
} from "./api";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const DUELS_PAR_LOT = 5;

/**
 * A/B de la traduction et du placement (0620), dans Tests seulement : le duel
 * à l'aveugle sur des slideshows déjà publiés, le deck parti contre celui d'un
 * nouveau circuit. Rien ne part en production (décision d'Adrien, 30/10).
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

  const liste = duels.data ?? [];
  const prets = liste.filter((d) => d.statut === "pret");
  const aVoter = prets.filter((d) => !d.choix);
  const votes = prets.filter((d) => d.choix);
  const echecs = liste.filter((d) => d.statut === "echec").length;
  const compte = (c: string) => votes.filter((d) => d.choix === c).length;

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
        {(circuits.error ?? duels.error ?? preparer.error) && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(circuits.error ?? duels.error ?? preparer.error)}
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

        {aVoter.map((d) => (
          <CarteDuel key={d.id} duel={d} cleDuels={cleDuels} />
        ))}
        {votes.length > 0 && (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("abTraduction.duels.votes", { n: votes.length })}
            </summary>
            <div className="mt-3 space-y-4">
              {votes.map((d) => (
                <CarteDuel key={d.id} duel={d} cleDuels={cleDuels} />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function CarteDuel({ duel, cleDuels }: { duel: Duel; cleDuels: unknown[] }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [remarque, setRemarque] = React.useState(duel.remarque ?? "");
  const voter = useMutation({
    mutationFn: (cote: "gauche" | "droite" | "egal") => voterDuel(duel.id, choixDepuisCote(duel, cote), remarque),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: cleDuels }),
  });
  const [gauche, droite] = decksAffiches(duel);
  const revele = duel.choix !== null;
  const nomCote = (cote: "gauche" | "droite") => {
    if (!revele) return t(`abTraduction.duels.${cote}`);
    const qui = cote === "gauche" ? duel.gauche : duel.gauche === "actuel" ? "candidat" : "actuel";
    return `${t(`abTraduction.duels.${cote}`)} · ${t(`abTraduction.duels.qui_${qui}`)}`;
  };
  const positions = duel.slides_source.map((s) => s.position);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="w-8 py-1 pr-2 font-medium">#</th>
              <th className="py-1 pr-3 font-medium">{t("abTraduction.duels.source")}</th>
              <th className="py-1 pr-3 font-medium">{nomCote("gauche")}</th>
              <th className="py-1 font-medium">{nomCote("droite")}</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p} className="border-t align-top">
                <td className="py-1.5 pr-2 text-xs text-muted-foreground">{p}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{texteSlide(duel.slides_source, p)}</td>
                <CelluleSlide slides={gauche} position={p} />
                <CelluleSlide slides={droite} position={p} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      {voter.error && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(voter.error)}
        </p>
      )}
    </div>
  );
}

function texteSlide(slides: SlideDuel[], position: number): string {
  return slides.find((s) => s.position === position)?.texte_overlay ?? "";
}

function CelluleSlide({ slides, position }: { slides: SlideDuel[]; position: number }) {
  const { t } = useTranslation();
  const slide = slides.find((s) => s.position === position);
  return (
    <td className="py-1.5 pr-3">
      {slide?.position_sophia && (
        <Badge variant="info" className="mb-1">
          {t("abTraduction.duels.slideAppli")}
        </Badge>
      )}
      <p className="whitespace-pre-line">{slide?.texte_overlay ?? ""}</p>
    </td>
  );
}
