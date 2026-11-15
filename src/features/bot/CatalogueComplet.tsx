import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  type ATrier,
  enregistrerAutre,
  type EntreeAutre,
  type EntreeCatalogue,
  lireATrier,
  lireCatalogue,
  lireCatalogueAutres,
  type Portee,
  questionSeule,
  reponseSeule,
  trancher,
} from "./api";
import { Catalogue, Erreur } from "./PageBot";

const SEL = "h-8 rounded-md border bg-background px-2 text-sm";
const PORTEE: Record<Portee, string> = { tous: "Tous", upwork: "Upwork", ruul: "Ruul" };

/**
 * 0680 (Max, 12/11) : le Catalogue de Support montre TOUT ce que le bot peut répondre :
 * À trier (doublons, contradictions), les réponses officielles, puis les réponses de
 * l'ancien bot FAQ et la FAQ par situation. Rien n'est effacé ni fusionné sans Max.
 */
export function CatalogueComplet() {
  return (
    <div className="space-y-6" data-testid="catalogue-complet">
      <ListeATrier />
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Réponses officielles</h2>
        <Catalogue />
      </section>
      <CatalogueAutres />
    </div>
  );
}

// --- À trier ---------------------------------------------------------------------

interface Element {
  cle: string;
  libelle: string;
  question: string;
  reponse: string;
  actif: boolean;
}

function decrire(el: { source: string; id: string }, ro: EntreeCatalogue[], autres: EntreeAutre[]): Element {
  if (el.source === "ro") {
    const e = ro.find((x) => x.id === el.id);
    return { cle: el.id, libelle: "Réponse officielle", question: e?.question ?? "?", reponse: e?.reponse ?? "", actif: e?.actif ?? false };
  }
  const e = autres.find((x) => x.id === el.id);
  const libelle = el.source === "ctx" ? "Bot FAQ" : `FAQ · ${e?.situation ?? "situation"}`;
  const question = e ? (e.source === "ctx" ? questionSeule(e.question, e.reponse) : e.question) : "?";
  return { cle: el.id, libelle, question, reponse: e ? (e.source === "ctx" ? reponseSeule(e.reponse) : e.reponse) : "", actif: e?.actif ?? false };
}

export function ListeATrier() {
  const liste = useQuery({ queryKey: ["bot", "a_trier"], queryFn: lireATrier });
  const ro = useQuery({ queryKey: ["bot", "catalogue"], queryFn: lireCatalogue });
  const autres = useQuery({ queryKey: ["bot", "catalogue_autres"], queryFn: lireCatalogueAutres });
  const [voirTranches, setVoirTranches] = React.useState(false);
  const toutes = liste.data ?? [];
  const aTrier = toutes.filter((t) => t.statut === "a_trier");
  const visibles = voirTranches ? toutes : aTrier;
  return (
    <section className="space-y-2" data-testid="a-trier">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-semibold">À trier <span className="font-normal text-muted-foreground">({aTrier.length})</span></h2>
        <p className="text-xs text-muted-foreground">Doublons et contradictions. Rien ne change tant que tu ne choisis pas : ce que tu ne gardes pas est éteint, jamais effacé.</p>
        {toutes.length > aTrier.length && (
          <button type="button" className="text-xs underline" onClick={() => setVoirTranches(!voirTranches)}>
            {voirTranches ? "Cacher ceux déjà triés" : `Voir aussi les ${toutes.length - aTrier.length} déjà triés`}
          </button>
        )}
      </div>
      <Erreur e={liste.error ?? ro.error ?? autres.error} />
      {visibles.map((t) => (
        <CarteATrier key={t.id} t={t} elements={t.elements.map((el) => decrire(el, ro.data ?? [], autres.data ?? []))} />
      ))}
    </section>
  );
}

function CarteATrier({ t, elements }: { t: ATrier; elements: Element[] }) {
  const qc = useQueryClient();
  const [garder, setGarder] = React.useState<Set<string>>(() => new Set(t.garder ?? elements.map((e) => e.cle)));
  const valider = useMutation({
    mutationFn: () => trancher(t.id, [...garder]),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["bot"] }),
  });
  const fini = t.statut === "tranche";
  const basculer = (cle: string) => {
    const s = new Set(garder);
    if (s.has(cle)) s.delete(cle);
    else s.add(cle);
    setGarder(s);
  };
  return (
    <Card className={t.type === "contradiction" ? "border-amber-300 dark:border-amber-700" : ""} data-testid="a-trier-carte">
      <CardContent className="space-y-2 p-3 text-sm">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{t.sujet}</span>
          <Badge variant={t.type === "contradiction" ? "destructive" : "secondary"}>{t.type === "contradiction" ? "Contradiction" : "Doublon"}</Badge>
          {fini && <Badge variant="outline">trié</Badge>}
        </p>
        <p className="text-muted-foreground">{t.raison}</p>
        <ul className="space-y-1.5">
          {elements.map((e) => (
            <li key={e.cle} className="flex items-start gap-2 rounded-md border p-2">
              <input type="checkbox" className="mt-1" aria-label={`Garder : ${e.question}`} checked={garder.has(e.cle)} disabled={fini} onChange={() => basculer(e.cle)} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">{e.libelle}{e.actif ? "" : " · éteinte"}</span>
                <span className="block font-medium">{e.question}</span>
                <span className="block whitespace-pre-line text-muted-foreground">{e.reponse}</span>
              </span>
            </li>
          ))}
        </ul>
        {!fini && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={valider.isPending || garder.size === 0} onClick={() => valider.mutate()}>
              {garder.size === elements.length ? "Tout garder" : `Garder ${garder.size}, éteindre ${elements.length - garder.size}`}
            </Button>
            <span className="text-xs text-muted-foreground">Coche ce que le bot doit continuer à utiliser.</span>
          </div>
        )}
        <Erreur e={valider.error} />
      </CardContent>
    </Card>
  );
}

// --- Les autres réponses ------------------------------------------------------------

export function CatalogueAutres() {
  const autres = useQuery({ queryKey: ["bot", "catalogue_autres"], queryFn: lireCatalogueAutres });
  const [q, setQ] = React.useState("");
  const [inactifs, setInactifs] = React.useState(false);
  const liste = (autres.data ?? []).filter((e) => (inactifs || e.actif) && (!q.trim() || `${e.question} ${e.reponse}`.toLowerCase().includes(q.trim().toLowerCase())));
  const ctx = liste.filter((e) => e.source === "ctx");
  const faq = liste.filter((e) => e.source === "faq");
  const parQuestion = new Map<string, EntreeAutre[]>();
  for (const e of faq) parQuestion.set(e.question, [...(parQuestion.get(e.question) ?? []), e]);
  return (
    <section className="space-y-4" data-testid="catalogue-autres">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <h2 className="mr-2 text-base font-semibold">Réponses de l'ancien bot FAQ</h2>
        <Input aria-label="Chercher dans les réponses du bot FAQ" placeholder="Chercher…" className="h-8 w-56" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1"><input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} />Éteintes aussi</label>
      </div>
      <Erreur e={autres.error} />
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Questions-réponses du bot FAQ <span className="font-normal text-muted-foreground">({ctx.length})</span></h3>
        {ctx.map((e) => <LigneAutre key={e.id} e={e} />)}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">FAQ par situation <span className="font-normal text-muted-foreground">({faq.length} réponses, {parQuestion.size} questions)</span></h3>
        <p className="text-xs text-muted-foreground">Une réponse par situation de la personne ; les {"{variables}"} sont remplies avec sa fiche.</p>
        {[...parQuestion.entries()].map(([question, lignes]) => (
          <div key={question} className="space-y-1.5">
            <p className="text-sm font-medium">{question}</p>
            {lignes.map((e) => <LigneAutre key={e.id} e={e} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

function LigneAutre({ e }: { e: EntreeAutre }) {
  const qc = useQueryClient();
  const [edition, setEdition] = React.useState(false);
  const affichee = e.source === "ctx" ? reponseSeule(e.reponse) : e.reponse;
  const questionComplete = e.source === "ctx" ? questionSeule(e.question, e.reponse) : e.question;
  const [c, setC] = React.useState({ question: questionComplete, reponse: affichee, categorie: e.categorie ?? "", portee: e.portee, actif: e.actif });
  const sauver = useMutation({
    mutationFn: (v: typeof c) => enregistrerAutre({
      source: e.source, id: e.id, question: v.question,
      // Le bot FAQ garde le format « Question : … Réponse : … » de l'ancienne page.
      reponse: e.source === "ctx" ? `Question : ${v.question}\n\nRéponse : ${v.reponse}` : v.reponse,
      categorie: v.categorie || null, portee: v.portee, actif: v.actif,
    }),
    onSuccess: () => { setEdition(false); void qc.invalidateQueries({ queryKey: ["bot"] }); },
  });
  return (
    <div className={`rounded-md border p-3 text-sm ${e.actif ? "" : "opacity-60"}`} data-testid="catalogue-autre">
      {!edition ? (
        <button type="button" className="block w-full text-left" onClick={() => setEdition(true)}>
          <span className="flex flex-wrap items-center gap-1.5">
            {e.source === "ctx" ? <span className="font-medium">{questionComplete}</span> : <span className="text-xs text-muted-foreground">{e.situation}</span>}
            <Badge variant="outline">{PORTEE[e.portee] ?? e.portee}</Badge>
            {e.categorie && <Badge variant="outline">{e.categorie}</Badge>}
            {e.audience === "hiring_manager" && <Badge variant="secondary">pour les HM</Badge>}
            {!e.actif && <Badge variant="secondary">éteinte</Badge>}
          </span>
          <span className="mt-1 block whitespace-pre-line text-muted-foreground">{affichee}</span>
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block space-y-1">Question
            <Input value={c.question} onChange={(x) => setC({ ...c, question: x.target.value })} />
          </label>
          {e.source === "faq" && <p className="text-xs text-muted-foreground">La question type est commune à toutes ses situations.</p>}
          <label className="block space-y-1">Réponse
            <Textarea rows={4} value={c.reponse} onChange={(x) => setC({ ...c, reponse: x.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="space-y-1">Catégorie
              <Input className="h-8 w-40" value={c.categorie} onChange={(x) => setC({ ...c, categorie: x.target.value })} />
            </label>
            <label className="space-y-1">Plateforme
              <select className={`${SEL} block`} value={c.portee} onChange={(x) => setC({ ...c, portee: x.target.value as Portee })}>
                <option value="tous">Tous</option><option value="upwork">Upwork</option><option value="ruul">Ruul</option>
              </select>
            </label>
            <label className="flex items-end gap-1 pb-1"><input type="checkbox" checked={c.actif} onChange={(x) => setC({ ...c, actif: x.target.checked })} />Utilisée par le bot</label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={c.reponse.trim().length < 2 || sauver.isPending} onClick={() => sauver.mutate(c)}>Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdition(false)}>Annuler</Button>
          </div>
          <Erreur e={sauver.error} />
        </div>
      )}
    </div>
  );
}
