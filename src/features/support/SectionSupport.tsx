import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { chercherPosteurs, enregistrerConsigne, enregistrerEntree, type PosteurTrouve, simuler } from "@/features/bot/api";
import { CatalogueComplet } from "@/features/bot/CatalogueComplet";
import { Consignes } from "@/features/bot/Consignes";
import { Documents } from "@/features/bot/Documents";
import { Exemples } from "@/features/bot/Exemples";
import { Suivi, Tester, Tests } from "@/features/bot/PageBot";
import { Regles } from "@/features/bot/Regles";

import {
  aRepondre,
  changer,
  chezLeBot,
  type CleQui,
  envoyerReponse,
  envoyerTicket,
  filtrerToutes,
  type FiltresToutes,
  lienCapture,
  lireCapacites,
  lireDetail,
  lireToutes,
  type LigneToutes,
  nomBot,
  quiAAgi,
  regleProposee,
  type TraceDemande,
} from "./api";
import { Controle } from "./Controle";
import { ConversationPosteur } from "./Conversation";
import { Entrainer } from "./Entrainer";
import { PageHelp } from "./PageHelp";

type OngletSupport = "repondre" | "toutes" | "bot" | "entrainer" | "controle";
const ONGLETS_SUPPORT: readonly { cle: OngletSupport; contenu: string }[] = [
  { cle: "repondre", contenu: "À répondre" },
  { cle: "toutes", contenu: "Toutes les demandes" },
  { cle: "bot", contenu: "Ce que le bot sait" },
  { cle: "entrainer", contenu: "🎯 Entraîner le bot" },
  { cle: "controle", contenu: "🎛️ Contrôle" },
];
/** Les anciens onglets (liens déjà partagés : ?onglet=boite, ?onglet=tester…) mènent au bon endroit. */
const ANCIENS: Record<string, OngletSupport> = {
  boite: "repondre", apercu: "bot", tester: "bot", consignes: "bot", regles: "bot", catalogue: "bot", documents: "bot", exemples: "bot", tests: "bot", suivi: "bot",
};

/**
 * 13/11 (Max) : « Support », une seule page en 3 onglets. À répondre (ce que le bot n'a pas su, ce que
 * le posteur a renvoyé) ; Toutes les demandes (Help + Slack, « qui a agi ») ; Ce que le bot sait
 * (ce qu'il fait seul, tester une question, consignes, règles, réponses apprises, documents).
 * L'onglet est dans l'adresse (?onglet=toutes).
 */
export function SectionSupport() {
  const [params, setParams] = useSearchParams();
  const brut = params.get("onglet") ?? "";
  const onglet: OngletSupport = ONGLETS_SUPPORT.some((o) => o.cle === brut) ? (brut as OngletSupport) : ANCIENS[brut] ?? "repondre";
  const choisir = (o: OngletSupport) => {
    const p = new URLSearchParams(params);
    p.set("onglet", o);
    setParams(p, { replace: true });
  };
  const toutes = useQuery({ queryKey: ["support", "toutes"], queryFn: () => lireToutes(), refetchInterval: 60_000 });
  const n = aRepondre(toutes.data ?? []).length;
  return (
    <div className="space-y-4" data-testid="section-support">
      <div className="-mx-1 overflow-x-auto px-1">
        <Segments
          libelle="Onglets du support"
          options={ONGLETS_SUPPORT.map((o) => (o.cle === "repondre" && n > 0 ? { ...o, contenu: `${o.contenu} (${n})` } : o))}
          actif={onglet}
          onChange={choisir}
          className="flex-nowrap whitespace-nowrap"
        />
      </div>
      {toutes.error && <p className="text-sm text-destructive">{(toutes.error as Error).message}</p>}
      {onglet === "repondre" && <ARepondre lignes={toutes.data ?? []} charge={toutes.isLoading} />}
      {onglet === "toutes" && <Toutes lignes={toutes.data ?? []} />}
      {onglet === "entrainer" && <Entrainer />}
      {onglet === "controle" && <Controle />}
      {onglet === "bot" && <BotSait initial={(SOUS_BOT as readonly string[]).includes(brut) ? (brut as SousBot) : "tester"} />}
    </div>
  );
}

const LIBELLES_QUI: Record<CleQui, { texte: string; classe: string }> = {
  bot: { texte: "Répondu par le bot", classe: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  mot_de_passe: { texte: "Action : mot de passe renvoyé", classe: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  lien_slack: { texte: "Action : lien Slack renvoyé", classe: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  email_ruul: { texte: "Action : email Ruul changé", classe: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  pseudo_tiktok: { texte: "Action : pseudo TikTok corrigé", classe: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  parrainage: { texte: "Action : parrainage renvoyé", classe: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  arret: { texte: "Action : arrêt transmis", classe: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  etape: { texte: "Action : étape marquée", classe: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  ruul_bot: { texte: "Envoyé à Ruul Bot", classe: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
  os_tickets: { texte: "Envoyé à OS tickets", classe: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  max: { texte: "Pour Max", classe: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  equipe: { texte: "Répondu par l'équipe", classe: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200" },
  renvoyee: { texte: "Renvoyée par le posteur", classe: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  regle_bot: { texte: "Réglé par", classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  remonte: { texte: "Remonté par", classe: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200" },
};

/** 0706 : « chez control_bot · passage 1/2 » tant que son bot ne l'a ni réglée ni remontée. */
export function ChezBot({ d }: { d: TraceDemande }) {
  if (!chezLeBot(d)) return null;
  return (
    <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-800 text-xs dark:bg-indigo-950 dark:text-indigo-200" data-testid="chez-bot">
      Chez {nomBot(d.bot_responsable)} · passage {Math.min(d.bot_passages ?? 0, 2)}/2
    </span>
  );
}

const OPTIONS_BOTS = ["new_cohort_bot", "control_bot", "pay_bot", "ruul_bot", "os_tickets", "max"] as const;

function FiltreBot({ valeur, onChange, classe }: { valeur: string; onChange: (v: string) => void; classe: string }) {
  return (
    <select className={classe} value={valeur} onChange={(e) => onChange(e.target.value)} aria-label="Bot responsable">
      <option value="">Bot responsable : tous</option>
      {OPTIONS_BOTS.map((b) => <option key={b} value={b}>{nomBot(b)}</option>)}
    </select>
  );
}

export function QuiAAgi({ d }: { d: TraceDemande }) {
  const liste = quiAAgi(d);
  if (liste.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid="qui-a-agi">
      {liste.map((x, i) => (
        <span key={i} className={`rounded-full px-2 py-0.5 font-medium text-xs ${LIBELLES_QUI[x.cle].classe}`}>
          {LIBELLES_QUI[x.cle].texte}{x.detail ? ` (${x.detail})` : ""}
        </span>
      ))}
    </span>
  );
}

const SOURCES: Record<string, string> = {
  help: "Help", slack_salon: "Slack · salon", slack_aide: "Slack · I need help", slack: "Slack", email: "Email", upwork: "Upwork",
};
const STATUTS: Record<string, string> = { bot: "Répondu par le bot", ouvert: "À répondre", attente_posteur: "Attente posteur", resolu: "Résolu" };
const quand = (at: string) => new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

// --- a) À répondre ----------------------------------------------------------------

function ARepondre({ lignes, charge }: { lignes: LigneToutes[]; charge: boolean }) {
  const [bot, setBot] = React.useState("");
  const liste = aRepondre(lignes).filter((l) => !bot || l.bot_responsable === bot || l.regle_par_bot === bot || l.remonte_par === bot);
  return (
    <div className="space-y-3" data-testid="a-repondre">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Ce que le bot n'a pas su, et ce que le posteur a renvoyé (« I still need help »). L'argent (Pour Max) d'abord, puis la plus ancienne.
          Chaque demande passe d'abord par son bot ; sans rien faire après 2 passages, elle remonte chez toi.
        </p>
        <FiltreBot valeur={bot} onChange={setBot} classe="h-9 rounded-md border bg-background px-2 text-sm" />
      </div>
      {!charge && liste.length === 0 && <Card><CardContent className="p-6 text-center">Rien à répondre 👌</CardContent></Card>}
      {liste.map((l) => <CarteARepondre key={l.id} l={l} />)}
    </div>
  );
}

function CarteARepondre({ l }: { l: LigneToutes }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["support", "detail", l.id], queryFn: () => lireDetail(l.id) });
  const d = detail.data;
  const [reponse, setReponse] = React.useState<string | null>(null);
  const [apprendre, setApprendre] = React.useState(true);
  const [type, setType] = React.useState<"regle" | "reponse">("regle");
  const [regle, setRegle] = React.useState<string | null>(null);
  const [conv, setConv] = React.useState(false);
  const texte = reponse ?? d?.brouillon ?? "";
  const texteRegle = regle ?? regleProposee(l.texte, texte);
  const rafraichir = () => { void qc.invalidateQueries({ queryKey: ["support"] }); };
  const envoyer = useMutation({
    mutationFn: async () => {
      await envoyerReponse(l.id, texte.trim());
      if (!apprendre) return;
      if (type === "regle") await enregistrerConsigne(null, texteRegle.trim(), true);
      else {
        await enregistrerEntree(null, {
          question: l.texte.slice(0, 500), formulations: [l.texte.slice(0, 500)], reponse: texte.trim(), action: null, niveau: "bot",
          portee: l.plateforme === "ruul" || l.plateforme === "upwork" ? l.plateforme : "tous", categorie: l.categorie, actif: true, valide: true,
        });
      }
    },
    onSuccess: rafraichir,
  });
  const resoudre = useMutation({ mutationFn: () => changer(l.id, { statut: "resolu" }), onSuccess: rafraichir });
  const ticket = useMutation({ mutationFn: () => envoyerTicket(l.id), onSuccess: rafraichir });
  const fiche = d?.fiche;
  const derniereBot = [...(d?.messages ?? [])].reverse().find((m) => m.auteur === "bot");
  return (
    <Card data-testid="carte-a-repondre">
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <b>{l.nom}</b>
            {l.email && <span className="text-muted-foreground text-xs">{l.email}</span>}
            {l.plateforme && <Badge variant="outline">{l.plateforme === "ruul" ? "Ruul" : "Upwork"}</Badge>}
            <Badge variant="outline">{SOURCES[l.source] ?? l.source}</Badge>
            <ChezBot d={l} />
            <QuiAAgi d={l} />
          </div>
          <span className="text-muted-foreground text-xs">{quand(l.escalade_at ?? l.cree_at)}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="pb-1 text-muted-foreground text-xs uppercase">La question</p>
            <p className="whitespace-pre-wrap">{l.texte}</p>
            {(d?.messages ?? []).filter((m) => m.auteur === "posteur").map((m, i) => (
              <p key={i} className="mt-2 whitespace-pre-wrap border-t pt-2">{m.texte}</p>
            ))}
          </div>
          <div className="rounded-md border bg-muted/30 p-3" data-testid="fiche-posteur">
            <p className="pb-1 text-muted-foreground text-xs uppercase">La fiche</p>
            {fiche ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">Plateforme</dt><dd>{fiche.plateforme === "ruul" ? "Ruul" : "Upwork"}{fiche.debut ? ` · début ${fiche.debut}` : ""}</dd>
                <dt className="text-muted-foreground">Étape</dt><dd>{fiche.manque.length ? `manque : ${fiche.manque.join(", ")}` : "tout fait"}</dd>
                <dt className="text-muted-foreground">Paie</dt><dd>{fiche.derniere_paie?.semaine ? `${fiche.derniere_paie.semaine} · ${fiche.derniere_paie.statut ?? "?"}${fiche.derniere_paie.montant != null ? ` · ${fiche.derniere_paie.montant} $` : ""}` : "—"}</dd>
                {fiche.ruul && <><dt className="text-muted-foreground">Ruul</dt><dd>{fiche.ruul.statut ?? "?"}</dd></>}
                <dt className="text-muted-foreground">Slack</dt><dd>{fiche.slack_relie ? "relié" : "non"}</dd>
                {fiche.tiktok && <><dt className="text-muted-foreground">TikTok</dt><dd>@{fiche.tiktok}</dd></>}
              </dl>
            ) : (
              <p className="text-muted-foreground text-xs">{detail.isLoading ? "…" : "Personne inconnue (pas de fiche)."}</p>
            )}
          </div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="pb-1 text-muted-foreground text-xs uppercase">Ce que le bot a répondu</p>
          <p className="whitespace-pre-wrap">{derniereBot?.texte ?? l.bot_reponse ?? "Rien (passé directement à l'équipe)."}</p>
        </div>
        <label className="block space-y-1">
          <span className="font-medium">Ta réponse (dans son chat + email « You have a new answer »)</span>
          <Textarea value={texte} onChange={(e) => setReponse(e.target.value)} rows={3} data-testid="reponse-admin" />
        </label>
        <div className="space-y-2 rounded-md border border-violet-300 border-dashed bg-violet-50/50 p-3 dark:bg-violet-950/20">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={apprendre} onChange={(e) => setApprendre(e.target.checked)} data-testid="apprendre" />
            Apprendre au bot
          </label>
          {apprendre && (
            <>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="radio" checked={type === "regle"} onChange={() => setType("regle")} /> Règle (consigne)</label>
                <label className="flex items-center gap-1"><input type="radio" checked={type === "reponse"} onChange={() => setType("reponse")} /> Réponse type (catalogue)</label>
              </div>
              {type === "regle" ? (
                <Textarea value={texteRegle} onChange={(e) => setRegle(e.target.value)} rows={3} aria-label="La règle apprise" />
              ) : (
                <p className="text-muted-foreground text-xs">La question et ta réponse entrent au catalogue, validées, pour {l.plateforme === "ruul" ? "Ruul" : l.plateforme === "upwork" ? "Upwork" : "tous"}.</p>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={texte.trim().length < 2 || envoyer.isPending} onClick={() => envoyer.mutate()} data-testid="envoyer-admin">Envoyer</Button>
          <Button variant="outline" disabled={resoudre.isPending} onClick={() => resoudre.mutate()}>Marquer résolu sans répondre</Button>
          {!l.ticket_at && <Button variant="outline" disabled={ticket.isPending} onClick={() => ticket.mutate()}>Envoyer à OS tickets</Button>}
          {l.poster_id && <Button variant="outline" onClick={() => setConv(!conv)} data-testid="voir-conversation">{conv ? "Masquer la conversation" : "💬 Conversation complète"}</Button>}
          {d?.capture && <BoutonCapture capture={d.capture} />}
        </div>
        {(envoyer.error || resoudre.error || ticket.error) && <p className="text-destructive">{((envoyer.error ?? resoudre.error ?? ticket.error) as Error).message}</p>}
        {envoyer.isSuccess && <p className="text-success">Envoyé{apprendre ? " · appris par le bot" : ""}.</p>}
        {conv && l.poster_id && <ConversationPosteur posterId={l.poster_id} demandeId={l.id} source={l.source} />}
      </CardContent>
    </Card>
  );
}

function BoutonCapture({ capture }: { capture: string }) {
  const lien = useMutation({ mutationFn: () => lienCapture(capture), onSuccess: (u) => window.open(u, "_blank", "noopener") });
  return <Button variant="outline" onClick={() => lien.mutate()}>Voir la capture</Button>;
}

// --- b) Toutes les demandes ----------------------------------------------------------

function Toutes({ lignes }: { lignes: LigneToutes[] }) {
  const [f, setF] = React.useState<FiltresToutes>({ q: "", source: "", statut: "", niveau: "", qui: "", bot: "" });
  const [ouverte, setOuverte] = React.useState<string | null>(null);
  const liste = filtrerToutes(lignes, f);
  const champ = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="space-y-3" data-testid="toutes-demandes">
      <div className="flex flex-wrap gap-2">
        <Input className="h-9 w-56" placeholder="Rechercher un nom ou un email…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Rechercher" />
        <select className={champ} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label="Source">
          <option value="">Source : toutes</option><option value="help">Help</option><option value="slack">Slack</option><option value="email">Email</option>
        </select>
        <select className={champ} value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })} aria-label="Statut">
          <option value="">Statut : tous</option>{Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={champ} value={f.niveau} onChange={(e) => setF({ ...f, niveau: e.target.value })} aria-label="Niveau">
          <option value="">Niveau : tous</option><option value="bot">Bot</option><option value="adrien">Adrien</option><option value="max">Max</option>
        </select>
        <select className={champ} value={f.qui} onChange={(e) => setF({ ...f, qui: e.target.value as FiltresToutes["qui"] })} aria-label="Qui a agi">
          <option value="">Qui a agi : tous</option>{(Object.keys(LIBELLES_QUI) as CleQui[]).map((k) => <option key={k} value={k}>{LIBELLES_QUI[k].texte}</option>)}
        </select>
        <FiltreBot valeur={f.bot ?? ""} onChange={(v) => setF({ ...f, bot: v })} classe={champ} />
      </div>
      <p className="text-muted-foreground text-xs">{liste.length} demande{liste.length > 1 ? "s" : ""} (les 400 plus récentes).</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground text-xs"><th className="py-2 pr-2">Quand</th><th className="pr-2">Posteur</th><th className="pr-2">Source</th><th className="pr-2">Question</th><th className="pr-2">Statut</th><th>Qui a agi</th></tr></thead>
          <tbody>
            {liste.map((l) => (
              <React.Fragment key={l.id}>
                <tr className="cursor-pointer border-b align-top hover:bg-muted/40" onClick={() => setOuverte(ouverte === l.id ? null : l.id)} data-testid="ligne-toutes">
                  <td className="whitespace-nowrap py-2 pr-2 text-xs">{quand(l.cree_at)}</td>
                  <td className="pr-2"><div className="font-medium">{l.nom}</div>{l.email && <div className="text-muted-foreground text-xs">{l.email}</div>}</td>
                  <td className="pr-2 text-xs">{SOURCES[l.source] ?? l.source}</td>
                  <td className="max-w-[320px] pr-2"><span className="line-clamp-2">{l.texte}</span></td>
                  <td className="whitespace-nowrap pr-2 text-xs">{STATUTS[l.statut] ?? l.statut}</td>
                  <td><span className="inline-flex flex-wrap gap-1"><ChezBot d={l} /><QuiAAgi d={l} /></span></td>
                </tr>
                {ouverte === l.id && (
                  <tr><td colSpan={6} className="bg-muted/20 p-3">
                    {l.poster_id ? <ConversationPosteur posterId={l.poster_id} demandeId={l.id} source={l.source} /> : <FilDemande id={l.id} />}
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilDemande({ id }: { id: string }) {
  const detail = useQuery({ queryKey: ["support", "detail", id], queryFn: () => lireDetail(id) });
  const d = detail.data;
  if (!d) return <p className="text-muted-foreground text-xs">{detail.isLoading ? "…" : "Introuvable."}</p>;
  return (
    <div className="space-y-2 text-sm" data-testid="fil-demande">
      <p className="whitespace-pre-wrap"><b>Posteur :</b> {d.texte}</p>
      {d.messages.map((m, i) => (
        <p key={i} className="whitespace-pre-wrap"><b>{m.auteur === "posteur" ? "Posteur" : m.auteur === "bot" ? "Bot" : "Équipe"} · {quand(m.cree_at)} :</b> {m.texte}</p>
      ))}
      {d.auto_resultat && <p className="text-muted-foreground text-xs">Fait par l'OS : {d.auto_action} → {d.auto_resultat}</p>}
    </div>
  );
}

// --- c) Ce que le bot sait -----------------------------------------------------------

const SOUS_BOT = ["tester", "apercu", "consignes", "regles", "catalogue", "documents", "exemples", "tests", "suivi"] as const;
type SousBot = (typeof SOUS_BOT)[number];

/** Ce que les bots font seuls : l'action, quel bot, et la dernière fois que l'OS l'a fait (« actif »). */
const CAPACITES: readonly { cle: string; action: string; bot: string }[] = [
  { cle: "reponse", action: "Répondre à une question (Help, Slack, email)", bot: "cerveau support" },
  { cle: "mot_de_passe", action: "Renvoyer identifiants + nouveau mot de passe", bot: "cerveau support · new_cohort_bot" },
  { cle: "slack", action: "Renvoyer le lien Slack / relier Slack", bot: "new_cohort_bot · control_bot" },
  { cle: "email_ruul", action: "Changer l'email Ruul (nouvelle adresse)", bot: "cerveau support → Ruul Bot" },
  { cle: "reinvitation_ruul", action: "Invitation Ruul pas reçue → réinvitation (max 2, puis Adrien)", bot: "cerveau support → Ruul Bot" },
  { cle: "ajout_ruul", action: "Ajouter dans Ruul les nouveaux signés, lire les statuts", bot: "Ruul Bot" },
  { cle: "tiktok", action: "Corriger le pseudo TikTok / relire le compte", bot: "cerveau support · new_cohort_bot · control_bot" },
  { cle: "parrainage", action: "Renvoyer l'email de parrainage", bot: "cerveau support" },
  { cle: "arret", action: "Arrêt demandé par le posteur", bot: "cerveau support · new_cohort_bot · control_bot · pay_bot" },
  { cle: "paie", action: "Questions de paie (répondre, jamais décider)", bot: "pay_bot" },
  { cle: "ticket", action: "Problème technique → ticket", bot: "système d'Adrien (#a-os-tickets)" },
  { cle: "max", action: "Argent, fraude, litige → Max", bot: "cerveau support" },
];

function BotSait({ initial }: { initial: SousBot }) {
  const [sous, setSous] = React.useState<SousBot>(initial);
  const cap = useQuery({ queryKey: ["support", "capacites"], queryFn: lireCapacites, staleTime: 5 * 60_000 });
  const limite = Date.now() - 14 * 86_400_000;
  return (
    <div className="space-y-4" data-testid="bot-sait">
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="font-semibold">Ce que le bot peut faire tout seul</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="capacites">
              <thead><tr className="border-b text-left text-muted-foreground text-xs"><th className="py-2 pr-2">Action</th><th className="pr-2">Quel bot</th><th>Actif</th></tr></thead>
              <tbody>
                {CAPACITES.map((c) => {
                  const at = cap.data?.[c.cle] ?? null;
                  const actif = at ? Date.parse(at) >= limite : false;
                  return (
                    <tr key={c.cle} className="border-b">
                      <td className="py-2 pr-2">{c.action}</td>
                      <td className="pr-2 text-xs">{c.bot}</td>
                      <td className="whitespace-nowrap text-xs">
                        {cap.isLoading ? "…" : cap.error ? "?" : actif
                          ? <span className="font-semibold text-success">oui · {new Date(at!).toLocaleDateString("fr-FR")}</span>
                          : <span className="font-semibold text-muted-foreground">non{at ? ` · dernière fois ${new Date(at).toLocaleDateString("fr-FR")}` : " · jamais"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs">« Actif » : l'OS l'a fait ces 14 derniers jours (lu en direct).</p>
        </CardContent>
      </Card>
      <div className="-mx-1 overflow-x-auto px-1">
        <Segments
          libelle="Ce que le bot sait"
          actif={sous}
          onChange={setSous}
          className="flex-nowrap whitespace-nowrap"
          options={[
            { cle: "tester", contenu: "Tester une question" }, { cle: "apercu", contenu: "Aperçu posteur" }, { cle: "consignes", contenu: "Consignes" },
            { cle: "regles", contenu: "Règles" }, { cle: "catalogue", contenu: "Réponses apprises" }, { cle: "documents", contenu: "Documents" },
            { cle: "exemples", contenu: "Exemples" }, { cle: "tests", contenu: "Tests" }, { cle: "suivi", contenu: "Suivi" },
          ]}
        />
      </div>
      {sous === "tester" && <Tester />}
      {sous === "apercu" && <ApercuPosteur />}
      {sous === "consignes" && <Consignes />}
      {sous === "regles" && <Regles />}
      {sous === "catalogue" && <CatalogueComplet />}
      {sous === "documents" && <Documents />}
      {sous === "exemples" && <Exemples />}
      {sous === "tests" && <Tests />}
      {sous === "suivi" && <Suivi />}
    </div>
  );
}

/** Aperçu posteur : la page Help exacte d'un posteur réel ou d'un faux profil Upwork / Ruul. */
function ApercuPosteur() {
  const [mode, setMode] = React.useState<"vrai" | "upwork" | "ruul">("upwork");
  const [recherche, setRecherche] = React.useState("");
  const [posteur, setPosteur] = React.useState<PosteurTrouve | null>(null);
  const trouves = useQuery({ queryKey: ["bot", "posteurs", recherche], queryFn: () => chercherPosteurs(recherche), enabled: mode === "vrai" && recherche.trim().length >= 2 });
  const plateforme = mode === "vrai" ? posteur?.plateforme ?? "upwork" : mode;
  const pret = mode !== "vrai" || !!posteur;
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 p-4">
          <Segments libelle="Quel posteur" actif={mode} onChange={(m) => { setMode(m); setPosteur(null); }}
            options={[{ cle: "upwork", contenu: "Faux profil Upwork" }, { cle: "ruul", contenu: "Faux profil Ruul" }, { cle: "vrai", contenu: "Vrai posteur" }]} />
          {mode === "vrai" && (
            posteur ? (
              <p className="text-sm">Vu comme <b>{posteur.nom}</b> ({posteur.plateforme === "ruul" ? "Ruul" : "Upwork"}) ·{" "}
                <button type="button" className="underline" onClick={() => setPosteur(null)}>changer</button></p>
            ) : (
              <div className="space-y-1">
                <Input aria-label="Chercher un posteur" placeholder="Prénom, nom ou email" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
                {(trouves.data ?? []).map((p) => (
                  <Button key={p.id} variant="outline" size="sm" className="mr-1" onClick={() => setPosteur(p)}>
                    {p.nom} · {p.plateforme === "ruul" ? "Ruul" : "Upwork"}
                  </Button>
                ))}
              </div>
            )
          )}
          <p className="text-xs text-muted-foreground">Aperçu en lecture seule : une question passe par le bot en simulation, rien n'est envoyé ni écrit.</p>
        </CardContent>
      </Card>
      {pret && (
        <div className="rounded-xl border-2 border-dashed p-3" data-testid="apercu-help">
          <PageHelp
            key={`${mode}-${posteur?.id ?? ""}`}
            apercu={{
              cle: `${mode}-${posteur?.id ?? ""}`,
              posterId: mode === "vrai" ? posteur!.id : null,
              plateforme,
              simuler: async (texte) => {
                const r = await simuler({
                  message: texte, source: "help", poster_id: mode === "vrai" ? posteur!.id : null,
                  profil: mode === "vrai" ? null : { plateforme, zone: "A", etape: "posting", statut: "actif", prenom: "Alex" },
                });
                return { reponse: r.texte, envoye_equipe: r.decision.niveau !== "bot" };
              },
            }}
          />
        </div>
      )}
    </div>
  );
}
