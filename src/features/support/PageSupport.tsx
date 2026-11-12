import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import {
  age,
  CATEGORIES,
  changer,
  cleCategorie,
  cleLibelle,
  compter,
  type DetailSupport,
  envoyerReponse,
  filtrer,
  type FiltresSupport,
  lienCapture,
  lireDetail,
  lireSupport,
  type LigneSupport,
  type TypeDemande,
  versOfficielles,
} from "./api";

const A = "support.admin";
const H = "support.help";
const PASTILLE: Record<LigneSupport["urgence"], string> = { rouge: "bg-red-500", orange: "bg-orange-400", gris: "bg-zinc-400" };
const FILTRES_VIDES: FiltresSupport = { plateforme: "", categorie: "", statut: "", retard: false };

/**
 * 0671 : « Support » (Recruitment automation). Deux onglets avec compteur,
 * Problems et Questions ; une ligne par demande ouverte (pastille d'urgence,
 * catégorie, posteur et plateforme, extrait, âge, « Late ») ; le panneau de
 * droite : le fil, la réponse proposée par le bot (modifiable), la fiche, et
 * Send reply / Mark solved / Move / Add to official answers.
 */
export function PageSupport() {
  const { t } = useTranslation();
  const lignes = useQuery({ queryKey: ["support", "liste"], queryFn: lireSupport, refetchInterval: 60_000 });
  const [onglet, setOnglet] = React.useState<TypeDemande>("probleme");
  const [f, setF] = React.useState<FiltresSupport>(FILTRES_VIDES);
  const [choisi, setChoisi] = React.useState<string | null>(null);
  const toutes = lignes.data ?? [];
  const visibles = filtrer(toutes, onglet, f);

  return (
    <div className="space-y-3" data-testid="page-support">
      <div className="flex flex-wrap gap-2">
        {(["probleme", "question"] as const).map((o) => (
          <Button key={o} variant={onglet === o ? "default" : "outline"} onClick={() => { setOnglet(o); setChoisi(null); }} data-testid={`onglet-${o}`}>
            {t(`${A}.onglets.${o}`)} <Badge variant="secondary" className="ml-1 bg-background text-foreground">{compter(toutes, o)}</Badge>
          </Button>
        ))}
      </div>
      <Filtres f={f} setF={setF} />
      {lignes.error && <p className="text-sm text-destructive">{(lignes.error as Error).message}</p>}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-2" data-testid="support-liste">
          {visibles.length === 0 && !lignes.isLoading && <p className="text-sm text-muted-foreground">{t(`${A}.vide`)}</p>}
          {visibles.map((l) => <Ligne key={l.id} l={l} actif={choisi === l.id} onClick={() => setChoisi(l.id)} />)}
        </div>
        <div>
          {choisi ? <Panneau id={choisi} onFini={() => setChoisi(null)} /> : <p className="text-sm text-muted-foreground">{t(`${A}.choisir`)}</p>}
        </div>
      </div>
    </div>
  );
}

function Filtres({ f, setF }: { f: FiltresSupport; setF: (f: FiltresSupport) => void }) {
  const { t } = useTranslation();
  const sel = "h-8 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="support-filtres">
      <select aria-label={t(`${A}.filtres.plateforme`)} className={sel} value={f.plateforme} onChange={(e) => setF({ ...f, plateforme: e.target.value as FiltresSupport["plateforme"] })}>
        <option value="">{t(`${A}.filtres.plateforme`)} : {t(`${A}.filtres.toutes`)}</option>
        <option value="ruul">Ruul</option>
        <option value="upwork">Upwork</option>
      </select>
      <select aria-label={t(`${A}.filtres.categorie`)} className={sel} value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}>
        <option value="">{t(`${A}.filtres.categorie`)} : {t(`${A}.filtres.toutes`)}</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c === "compte" ? "Ruul / Upwork" : t(`${H}.categories.${c}`)}</option>)}
      </select>
      <select aria-label={t(`${A}.filtres.statut`)} className={sel} value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value as FiltresSupport["statut"] })}>
        <option value="">{t(`${A}.filtres.statutOuverts`)}</option>
        <option value="ouvert">{t(`${A}.statuts.ouvert`)}</option>
        <option value="attente_posteur">{t(`${A}.statuts.attente_posteur`)}</option>
        <option value="resolu">{t(`${A}.statuts.resolu`)}</option>
      </select>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={f.retard} onChange={(e) => setF({ ...f, retard: e.target.checked })} />
        {t(`${A}.filtres.retard`)}
      </label>
    </div>
  );
}

function Ligne({ l, actif, onClick }: { l: LigneSupport; actif: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} data-testid="support-ligne"
      className={`flex w-full items-start gap-2 rounded-md border p-3 text-left text-sm hover:bg-muted/50 ${actif ? "border-primary bg-muted/50" : ""}`}>
      <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${PASTILLE[l.urgence]}`} data-testid={`pastille-${l.urgence}`} />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{t(`${H}.categories.${cleLibelle(l.type, l.categorie, l.plateforme)}`)}</span>
          <span className="text-muted-foreground">· {l.nom} · {l.plateforme === "ruul" ? "Ruul" : "Upwork"}</span>
          {l.en_retard && <Badge variant="error">{t(`${A}.late`)}</Badge>}
          {l.statut !== "ouvert" && <Badge variant="outline">{t(`${A}.statuts.${l.statut}`)}</Badge>}
        </span>
        <span className="block truncate text-muted-foreground">{l.extrait}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{age(l.escalade_at)}</span>
    </button>
  );
}

function Panneau({ id, onFini }: { id: string; onFini: () => void }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["support", "detail", id], queryFn: () => lireDetail(id) });
  const d = detail.data;
  const rafraichir = () => Promise.all([qc.invalidateQueries({ queryKey: ["support", "liste"] }), qc.invalidateQueries({ queryKey: ["support", "detail", id] })]);
  if (detail.error) return <p className="text-sm text-destructive">{(detail.error as Error).message}</p>;
  if (!d) return null;
  return <PanneauDetail key={d.id} d={d} rafraichir={rafraichir} onFini={onFini} />;
}

function PanneauDetail({ d, rafraichir, onFini }: { d: DetailSupport; rafraichir: () => Promise<unknown>; onFini: () => void }) {
  const { t } = useTranslation();
  const [texte, setTexte] = React.useState(d.brouillon ?? "");
  const [officielle, setOfficielle] = React.useState(false);
  const [portee, setPortee] = React.useState<"tous" | "ruul" | "upwork">(d.plateforme);
  const [categorie, setCategorie] = React.useState<string>(d.categorie ?? "autre");
  const [capture, setCapture] = React.useState<string | null>(null);

  const envoyer = useMutation({
    mutationFn: async () => {
      const r = await envoyerReponse(d.id, texte.trim());
      if (officielle) await versOfficielles({ question: d.texte, reponse: texte.trim(), portee, categorie });
      return r;
    },
    onSuccess: () => void rafraichir(),
  });
  const action = useMutation({
    mutationFn: (p: { statut?: "ouvert" | "resolu"; type?: TypeDemande }) => changer(d.id, p),
    onSuccess: async (_r, p) => { await rafraichir(); if (p.type || p.statut === "resolu") onFini(); },
  });
  const ouvrirCapture = async () => setCapture(await lienCapture(d.capture!));

  return (
    <Card data-testid="support-panneau">
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`size-2.5 rounded-full ${PASTILLE[d.urgence]}`} />
          <span className="font-semibold">{t(`${H}.categories.${cleLibelle(d.type, d.categorie, d.plateforme)}`)}</span>
          <Badge variant="outline">{d.plateforme === "ruul" ? "Ruul" : "Upwork"}</Badge>
          <Badge variant="secondary">{t(`${A}.source.${d.source}`)}</Badge>
          <Badge variant="outline">{t(`${A}.statuts.${d.statut}`)}</Badge>
          {d.en_retard && <Badge variant="error">{t(`${A}.late`)}</Badge>}
        </div>

        {d.fiche ? <Fiche d={d} /> : <p className="text-muted-foreground">{t(`${A}.sansPosteur`)}{d.slack_user ? ` : ${d.slack_user}` : ""}</p>}

        <div className="space-y-1">
          <p className="font-medium">{t(`${A}.fil`)}</p>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="whitespace-pre-wrap">{d.texte}</p>
            {d.capture && (
              <button type="button" className="mt-1 text-xs underline" onClick={() => void ouvrirCapture()}>{t(`${A}.capture`)}</button>
            )}
            {capture && <img src={capture} alt="" className="mt-2 max-h-64 rounded border" />}
          </div>
          {d.auto_action && <p className="text-xs text-muted-foreground">{t(`${A}.auto`)} {d.auto_action} → {d.auto_resultat}</p>}
          {d.messages.map((m, i) => (
            <div key={i} className={m.auteur === "posteur" ? "rounded-md bg-muted/50 p-2" : "rounded-md border p-2"}>
              <p className="text-xs text-muted-foreground">{t(`${A}.auteurs.${m.auteur}`)} · {new Date(m.cree_at).toLocaleString("fr-FR")}</p>
              <p className="whitespace-pre-wrap">{m.texte}</p>
            </div>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="font-medium">{t(`${A}.brouillon`)}</span>
          <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={5} data-testid="support-reponse" />
        </label>
        <div className="space-y-2 rounded-md border p-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={officielle} onChange={(e) => setOfficielle(e.target.checked)} data-testid="support-officielle" />
            {t(`${A}.officielle`)}
          </label>
          {officielle && (
            <div className="flex flex-wrap gap-2">
              <select aria-label={t(`${A}.portee`)} className="h-8 rounded-md border bg-background px-2" value={portee} onChange={(e) => setPortee(e.target.value as typeof portee)}>
                <option value="tous">{t(`${A}.portee`)} : {t(`${A}.porteeTous`)}</option>
                <option value="ruul">{t(`${A}.portee`)} : Ruul</option>
                <option value="upwork">{t(`${A}.portee`)} : Upwork</option>
              </select>
              <select aria-label={t(`${A}.filtres.categorie`)} className="h-8 rounded-md border bg-background px-2" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`${H}.categories.${cleCategorie(c, d.plateforme)}`)}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!texte.trim() || envoyer.isPending} onClick={() => envoyer.mutate()} data-testid="support-envoyer">{t(`${A}.envoyer`)}</Button>
          {d.statut === "resolu"
            ? <Button variant="outline" onClick={() => action.mutate({ statut: "ouvert" })}>{t(`${A}.rouvrir`)}</Button>
            : <Button variant="outline" onClick={() => action.mutate({ statut: "resolu" })} data-testid="support-resolu">{t(`${A}.marquerResolu`)}</Button>}
          <Button variant="ghost" onClick={() => action.mutate({ type: d.type === "probleme" ? "question" : "probleme" })}>
            {d.type === "probleme" ? t(`${A}.versQuestions`) : t(`${A}.versProblemes`)}
          </Button>
        </div>
        {envoyer.isSuccess && <p className="text-emerald-700">{t(`${A}.envoye`)}</p>}
        {(envoyer.error ?? action.error) && <p className="text-destructive">{((envoyer.error ?? action.error) as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

function Fiche({ d }: { d: DetailSupport }) {
  const { t } = useTranslation();
  const f = d.fiche!;
  const F = `${A}.fiche`;
  const paie = f.derniere_paie;
  return (
    <div className="grid gap-x-4 gap-y-1 rounded-md border p-2 text-xs sm:grid-cols-2" data-testid="support-fiche">
      <p className="font-medium sm:col-span-2">{t(`${F}.titre`)} : {f.nom}</p>
      <p>{t(`${F}.debut`)} : {f.debut ?? "—"}</p>
      <p>{t(`${F}.tiktok`)} : {f.tiktok ? `@${f.tiktok}` : "—"}</p>
      <p>{t(`${F}.slack`)} : {f.slack_relie ? t(`${F}.oui`) : t(`${F}.non`)}</p>
      {f.plateforme === "ruul"
        ? <p>{t(`${F}.ruul`)} : {f.ruul?.statut ?? "—"}</p>
        : <p>{t(`${F}.contrat`)} : {f.contrat_upwork ?? "—"}</p>}
      <p>{t(`${F}.paie`)} : {paie ? `${paie.semaine ?? "?"} · ${paie.statut ?? "?"}${paie.montant != null ? ` · ${paie.montant} $` : ""}` : t(`${F}.aucune`)}</p>
      <p>{t(`${F}.parrainages`)} : {f.parrainages ? `${f.parrainages.declares} / ${f.parrainages.invites} / ${f.parrainages.recrues}` : "—"}</p>
      <p className="sm:col-span-2">{t(`${F}.manque`)} : {f.manque.length ? f.manque.join(" · ") : t(`${F}.aucune`)}</p>
      <Link to="/admin/posters" className="underline sm:col-span-2">{t(`${F}.ouvrir`)}</Link>
    </div>
  );
}
