import { useMutation, useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { enregistrerConsigne } from "@/features/bot/api";
import { lireProblemes, type Probleme } from "@/features/problemes/api";
import { cn } from "@/lib/utils";

import { type LigneToutes, lireToutes } from "./api";
import { ConversationPosteur } from "./Conversation";

const ICONES: Record<string, string> = { help: "🛟", email: "✉️", upwork: "🟢", slack: "💬", slack_salon: "💬", slack_aide: "💬" };

export interface FilPosteur {
  cle: string;
  poster_id: string | null;
  nom: string;
  dernier: string;
  /** Une demande attend un humain (ouverte, pas réglée par le bot) ou un problème urgent. */
  attente: boolean;
  pourMax: boolean;
  sources: string[];
  demande: LigneToutes | null;
  problemes: Probleme[];
  apercu: string;
}

/** Les demandes et problèmes regroupés par posteur, le plus récent d'abord ; « Pour Max » à part. */
export function filsParPosteur(demandes: readonly LigneToutes[], problemes: readonly Probleme[]): { pourMax: FilPosteur[]; autres: FilPosteur[] } {
  const fils = new Map<string, FilPosteur>();
  const prendre = (cle: string, poster: string | null, nom: string): FilPosteur => {
    let f = fils.get(cle);
    if (!f) {
      f = { cle, poster_id: poster, nom, dernier: "", attente: false, pourMax: false, sources: [], demande: null, problemes: [], apercu: "" };
      fils.set(cle, f);
    }
    return f;
  };
  for (const d of demandes) {
    const f = prendre(d.poster_id ?? `inconnu:${d.email ?? d.nom}`, d.poster_id, d.nom);
    const at = d.posteur_at && d.posteur_at > d.cree_at ? d.posteur_at : d.cree_at;
    if (at > f.dernier) { f.dernier = at; f.apercu = d.texte; }
    if (!f.sources.includes(d.source)) f.sources.push(d.source);
    const ouverte = d.statut === "ouvert";
    if (ouverte && d.niveau !== "bot") f.attente = true;
    if (ouverte && d.niveau === "max") f.pourMax = true;
    if ((ouverte && (!f.demande || f.demande.statut !== "ouvert")) || !f.demande) f.demande = d;
  }
  for (const p of problemes) {
    if (p.statut !== "ouvert" || !p.poster_id) continue;
    const f = prendre(p.poster_id, p.poster_id, p.nom ?? "?");
    f.problemes.push(p);
    if (p.niveau === "urgent") { f.pourMax = true; f.attente = true; }
    const at = p.maj_at ?? p.created_at;
    if (at > f.dernier) { f.dernier = at; f.apercu = p.resume; }
  }
  const tous = [...fils.values()].sort((a, b) => b.dernier.localeCompare(a.dernier));
  return { pourMax: tous.filter((f) => f.pourMax), autres: tous.filter((f) => !f.pourMax) };
}

const quand = (at: string) => new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * 13/11 (refonte, Phase 5) : la Boîte unique, façon messagerie. À gauche les posteurs (le plus récent d'abord,
 * point rouge = attend un humain, icône de la source), « 🔴 Pour Max » en haut ; à droite sa fiche, ses problèmes
 * ouverts et toute la conversation, avec la réponse sur le canal d'origine et « Apprendre au bot ».
 */
export function Boite() {
  const demandes = useQuery({ queryKey: ["support", "toutes"], queryFn: () => lireToutes(), refetchInterval: 60_000 });
  const problemes = useQuery({ queryKey: ["problemes", "ouverts"], queryFn: () => lireProblemes("ouverts"), refetchInterval: 120_000 });
  const [q, setQ] = React.useState("");
  const [choisi, setChoisi] = React.useState<string | null>(null);
  if (demandes.error) return <p className="text-destructive text-sm">{(demandes.error as Error).message}</p>;
  if (!demandes.data) return <p className="text-muted-foreground text-sm">Chargement…</p>;
  const { pourMax, autres } = filsParPosteur(demandes.data, problemes.data ?? []);
  const filtre = (l: FilPosteur[]) => (q.trim() ? l.filter((f) => `${f.nom} ${f.apercu}`.toLowerCase().includes(q.trim().toLowerCase())) : l);
  const tous = [...pourMax, ...autres];
  const actif = tous.find((f) => f.cle === choisi) ?? tous.find((f) => f.attente) ?? tous[0] ?? null;
  return (
    <div className="grid gap-3 md:grid-cols-[18rem_1fr]" data-testid="boite">
      <div className="space-y-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un posteur…" aria-label="Chercher un posteur" />
        <div className="max-h-[70vh] overflow-y-auto rounded-md border">
          {pourMax.length > 0 && <p className="bg-red-50 px-3 py-1 font-medium text-red-800 text-xs dark:bg-red-950/40 dark:text-red-200">🔴 Pour Max ({pourMax.length})</p>}
          {filtre(pourMax).map((f) => <Ligne key={f.cle} f={f} actif={actif?.cle === f.cle} onClick={() => setChoisi(f.cle)} />)}
          {pourMax.length > 0 && <p className="bg-muted/40 px-3 py-1 font-medium text-muted-foreground text-xs">Les autres</p>}
          {filtre(autres).map((f) => <Ligne key={f.cle} f={f} actif={actif?.cle === f.cle} onClick={() => setChoisi(f.cle)} />)}
          {tous.length === 0 && <p className="p-3 text-muted-foreground text-sm">Rien 👌</p>}
        </div>
      </div>
      <div className="min-w-0 space-y-3">{actif ? <Detail key={actif.cle} f={actif} /> : null}</div>
    </div>
  );
}

function Ligne({ f, actif, onClick }: { f: FilPosteur; actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="fil-posteur"
      className={cn("flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/40", actif && "bg-muted")}
    >
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", f.attente ? "bg-red-500" : "bg-transparent")} data-testid={f.attente ? "point-rouge" : undefined} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <b className="truncate">{f.nom}</b>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{f.dernier ? quand(f.dernier) : ""}</span>
        </span>
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          <span>{f.sources.map((s) => ICONES[s] ?? "•").join("")}{f.problemes.length ? "⚠️" : ""}</span>
          <span className="truncate">{f.apercu}</span>
        </span>
      </span>
    </button>
  );
}

function Detail({ f }: { f: FilPosteur }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-base">{f.nom}</h3>
        {f.pourMax && <Badge variant="destructive">Pour Max</Badge>}
        {f.demande?.ticket_at && <Badge variant="outline">→ OS tickets{f.demande.ticket_prevenu_at ? " · ✅ prévenu" : f.demande.ticket_regle_at ? " · ✅ réglé" : ""}</Badge>}
      </div>
      {f.problemes.length > 0 && (
        <div className="space-y-1 rounded-md border bg-amber-50/60 p-2 text-sm dark:bg-amber-950/20" data-testid="problemes-posteur">
          <p className="font-medium text-xs">Problèmes ouverts</p>
          {f.problemes.map((p) => (
            <p key={p.id} className="text-xs">
              <Badge variant="outline" className="mr-1">{p.niveau === "urgent" ? "🔴" : p.niveau === "bots" ? "🤖" : "📅"} {p.categorie}</Badge>
              {p.resume}
            </p>
          ))}
        </div>
      )}
      {f.poster_id ? (
        <ConversationPosteur posterId={f.poster_id} demandeId={f.demande?.statut === "ouvert" ? f.demande.id : null} source={f.demande?.source ?? null} />
      ) : (
        <div className="rounded-md border p-3 text-sm">
          <p className="text-muted-foreground text-xs">Personne inconnue dans l'OS ({f.demande?.email ?? "?"}).</p>
          <p className="whitespace-pre-wrap">{f.demande?.texte}</p>
        </div>
      )}
      <Apprendre />
    </>
  );
}

/** « Apprendre au bot » : une consigne ajoutée au cerveau du support (Ce que le bot sait → Consignes). */
function Apprendre() {
  const [ouvert, setOuvert] = React.useState(false);
  const [texte, setTexte] = React.useState("");
  const m = useMutation({ mutationFn: () => enregistrerConsigne(null, texte.trim(), true), onSuccess: () => setTexte("") });
  if (!ouvert) return <Button size="sm" variant="outline" onClick={() => setOuvert(true)} data-testid="apprendre">🎓 Apprendre au bot</Button>;
  return (
    <div className="space-y-1.5 rounded-md border p-2" data-testid="apprendre-panneau">
      <Textarea rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ce que le bot doit savoir ou faire la prochaine fois…" aria-label="Consigne pour le bot" />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={texte.trim().length < 5 || m.isPending} onClick={() => m.mutate()}>Enregistrer la consigne</Button>
        <Button size="sm" variant="ghost" onClick={() => setOuvert(false)}>Fermer</Button>
        {m.isSuccess && <span className="text-success text-xs">Le bot l'appliquera dès la prochaine réponse.</span>}
        {m.error && <span className="text-destructive text-xs">{(m.error as Error).message}</span>}
      </div>
    </div>
  );
}
