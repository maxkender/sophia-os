import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Swords } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  decksAffiches,
  type Duel,
  envoyerAuxRelecteurs,
  etatLot,
  listerCircuits,
  listerDuels,
  listerVotesRelecteurs,
  rapportVotesRelecteurs,
  type VoteRelecteur,
} from "@/features/abTraduction/api";
import { BlocLot, CLE_REQUETE_LOT } from "@/features/abTraduction/BlocLot";
import { BlocRelecteurs } from "@/features/abTraduction/BlocRelecteurs";
import { TableDuel } from "@/features/abTraduction/TableDuel";
import { formaterNombre, messageErreur } from "@/features/bleo/format";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { localeDate } from "@/locales/localeDate";

import { listerRelecteurs, type RelecteurAvecNom } from "./api";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const dateCourte = (iso: string, langue: string) =>
  new Date(iso).toLocaleDateString(localeDate(langue), { day: "numeric", month: "short" });

/**
 * Les duels envoyés aux relecteurs natifs, vus par l'admin (Relecture native,
 * onglet Duels) : le lot commun (0627), le bilan de la langue (votes, verdict
 * D8, notes, remarques) et chaque duel avec sa source, ses deux versions et
 * les votes des relecteurs, nom par nom, remarque comprise. Les colonnes
 * restent Version 1 / Version 2 tant que l'admin ne les révèle pas, duel par
 * duel ou d'un coup ; les relecteurs, eux, ne les voient jamais.
 */
export function DuelsAdmin() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const relecteurs = useQuery({ queryKey: ["relecteurs-natifs"], queryFn: listerRelecteurs });
  const langues = React.useMemo(
    () => [...new Set((relecteurs.data ?? []).map((r) => r.langue.toLowerCase()))].sort(),
    [relecteurs.data],
  );
  const [langueChoisie, setLangueChoisie] = React.useState<string | null>(null);
  const langue = langueChoisie && langues.includes(langueChoisie) ? langueChoisie : (langues[0] ?? null);
  const [toutRevele, setToutRevele] = React.useState(false);

  const circuits = useQuery({ queryKey: ["ab-traduction", "circuits"], queryFn: listerCircuits });
  const candidat = circuits.data?.[0] ?? null;
  const cleDuels = ["ab-traduction", "duels", langue, candidat?.id, candidat?.version];
  const duels = useQuery({
    queryKey: cleDuels,
    queryFn: () => listerDuels(langue!, candidat!.id, candidat!.version),
    enabled: Boolean(langue && candidat),
  });
  const lot = useQuery({ queryKey: CLE_REQUETE_LOT, queryFn: () => etatLot(1) });
  const cleRapport = ["ab-traduction", "votes-rapport", langue];
  const rapport = useQuery({ queryKey: cleRapport, queryFn: () => rapportVotesRelecteurs(langue!), enabled: Boolean(langue) });

  const liste = duels.data ?? [];
  const prets = liste.filter((d) => d.statut === "pret");
  const envoyes = prets.filter((d) => d.relecteurs_le);
  const nonEnvoyes = prets.filter((d) => !d.relecteurs_le);
  const echecs = liste.filter((d) => d.statut === "echec").length;
  const cleVotes = [...cleDuels, "votes", envoyes.map((d) => d.id).join(",")];
  const votes = useQuery({
    queryKey: cleVotes,
    queryFn: () => listerVotesRelecteurs(envoyes.map((d) => d.id)),
    enabled: envoyes.length > 0,
  });
  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: cleDuels });
    void queryClient.invalidateQueries({ queryKey: cleRapport });
    void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_LOT });
  };
  const envoyerTous = useMutation({
    mutationFn: () => envoyerAuxRelecteurs(nonEnvoyes.map((d) => d.id), true),
    onSuccess: rafraichir,
  });

  const positions = new Map((lot.data?.contenus ?? []).map((c) => [c.contenu_id, c]));
  const tries = [...envoyes].sort((a, b) => {
    const pa = a.contenu_id ? positions.get(a.contenu_id)?.position : undefined;
    const pb = b.contenu_id ? positions.get(b.contenu_id)?.position : undefined;
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
  const noms = new Map((relecteurs.data ?? []).map((r) => [r.profile_id, nomRelecteur(r)]));
  const votesDuDuel = (id: string) => (votes.data ?? []).filter((v) => v.duel_id === id);
  const ligneRapport = (rapport.data ?? []).find((r) => r.candidat === candidat?.id && r.version === candidat?.version) ?? null;
  const erreur = relecteurs.error ?? circuits.error ?? duels.error ?? votes.error ?? rapport.error ?? envoyerTous.error;

  return (
    <Card data-testid="duels-admin">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="size-4 text-primary" />
          {t("relectureNative.duelsAdmin.titre")}
        </CardTitle>
        <CardDescription>{t("relectureNative.duelsAdmin.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {relecteurs.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : langues.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("relectureNative.duelsAdmin.aucuneLangue")}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="duelsAdminLangue">{t("relectureNative.duelsAdmin.langue")}</Label>
              <select id="duelsAdminLangue" className={selectClass} value={langue ?? ""} onChange={(e) => setLangueChoisie(e.target.value)}>
                {langues.map((l) => (
                  <option key={l} value={l}>
                    {drapeauLangue(l)} {nomLangue(l)}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("relectureNative.duelsAdmin.compte", { prets: envoyes.length, votes: (votes.data ?? []).length, echecs })}
            </p>
            {envoyes.length > 0 && (
              <Button size="sm" variant={toutRevele ? "default" : "outline"} onClick={() => setToutRevele((v) => !v)}>
                {toutRevele ? <EyeOff /> : <Eye />}
                {toutRevele ? t("relectureNative.duelsAdmin.masquerTout") : t("relectureNative.duelsAdmin.revelerTout")}
              </Button>
            )}
          </div>
        )}
        {erreur && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(erreur)}
          </p>
        )}

        <BlocLot onChange={rafraichir} />

        {langue && (
          <BlocRelecteurs rapport={ligneRapport} nonEnvoyes={nonEnvoyes.length} envoyer={() => envoyerTous.mutate()} enCours={envoyerTous.isPending} />
        )}

        {langue && !duels.isPending && envoyes.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="duels-admin-vide">
            {t("relectureNative.duelsAdmin.aucunDuel")}
          </p>
        )}
        {tries.map((d) => (
          <CarteDuelAdmin
            key={d.id}
            duel={d}
            position={d.contenu_id ? positions.get(d.contenu_id) : undefined}
            votes={votesDuDuel(d.id)}
            noms={noms}
            toutRevele={toutRevele}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function nomRelecteur(r: Pick<RelecteurAvecNom, "prenom" | "nom" | "email">): string | null {
  const nom = [r.prenom, r.nom].filter(Boolean).join(" ").trim();
  return nom || r.email || null;
}

function CarteDuelAdmin({
  duel,
  position,
  votes,
  noms,
  toutRevele,
}: {
  duel: Duel;
  position: { position: number; label: string | null } | undefined;
  votes: VoteRelecteur[];
  noms: Map<string, string | null>;
  toutRevele: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [reveleIci, setReveleIci] = React.useState(false);
  const revele = toutRevele || reveleIci;
  const [gauche, droite] = decksAffiches(duel);
  const quiDe = (cote: "gauche" | "droite") => (cote === "gauche" ? duel.gauche : duel.gauche === "actuel" ? "candidat" : "actuel");
  const nomCote = (cote: "gauche" | "droite") =>
    revele ? `${t(`abTraduction.duels.${cote}`)} · ${t(`abTraduction.duels.qui_${quiDe(cote)}`)}` : t(`abTraduction.duels.${cote}`);
  const colonneDe = (choix: VoteRelecteur["choix"]) =>
    choix === "egal" ? null : choix === duel.gauche ? t("abTraduction.duels.gauche") : t("abTraduction.duels.droite");

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="duel-admin">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          {position ? t("relectureNative.duelsAdmin.duelN", { k: position.position }) : t("relectureNative.duelsAdmin.horsLot")}
        </span>
        {position?.label && <Badge variant="outline">{position.label}</Badge>}
        {duel.relecteurs_le && (
          <Badge variant="info">{t("abTraduction.duels.relecteurs.envoyeLe", { date: dateCourte(duel.relecteurs_le, i18n.language) })}</Badge>
        )}
        {duel.post_id && (
          <Link className="text-xs text-primary underline-offset-2 hover:underline" to={`/admin/posts/${duel.post_id}`}>
            {t("abTraduction.duels.voirPost")}
          </Link>
        )}
        {!toutRevele && (
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setReveleIci((v) => !v)}>
            {reveleIci ? <EyeOff /> : <Eye />}
            {reveleIci ? t("relectureNative.duelsAdmin.masquer") : t("relectureNative.duelsAdmin.reveler")}
          </Button>
        )}
      </div>

      <TableDuel source={duel.slides_source} gauche={gauche} droite={droite} titreGauche={nomCote("gauche")} titreDroite={nomCote("droite")} />

      {votes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("relectureNative.duelsAdmin.aucunVote")}</p>
      ) : (
        <ul className="space-y-2 text-sm" data-testid="duel-admin-votes">
          {votes.map((v) => {
            const colonne = revele ? colonneDe(v.choix) : null;
            return (
              <li key={v.id} className="rounded-md bg-muted/30 p-2">
                <p>
                  <span className="font-medium">{noms.get(v.profile_id) ?? t("relectureNative.duelsAdmin.sansNom")}</span>
                  {" · "}
                  {t("relectureNative.duelsAdmin.aChoisi", { choix: t(`abTraduction.duels.choix_${v.choix}`) })}
                  {colonne && ` (${colonne})`}
                  {(v.note_actuel != null || v.note_candidat != null) && (
                    <span className="text-muted-foreground">
                      {" · "}
                      {t("relectureNative.duelsAdmin.notes", {
                        actuel: formaterNombre(v.note_actuel, 0),
                        candidat: formaterNombre(v.note_candidat, 0),
                      })}
                    </span>
                  )}
                  <span className="text-muted-foreground"> · {dateCourte(v.updated_at, i18n.language)}</span>
                </p>
                {v.remarque && <p className="mt-1 whitespace-pre-line text-xs">{v.remarque}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
