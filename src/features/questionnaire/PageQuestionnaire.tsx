import * as React from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { type Brouillon, ecrireBrouillonLocal, envoyerCapture, jetonNavigateur, lireBrouillonLocal, sauverReponses } from "./api";
import { INTRO, listePays, manquantes, MERCI, type Question, type Reponses, SECTIONS, visible } from "./questions";

const VIDE: Brouillon = { identite: { nom: "", email: "", tiktok: "" }, reponses: {}, captures: {}, ecran: 0, termine: false };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGS = new Set(["warmup_suivis_type", "astuces", "warmup_recherche_quoi", "warmup_poste_quoi", "musique"]);

/**
 * 15/11 (Max) : le questionnaire public, par lien et sans connexion. En anglais, un écran par section, une barre
 * de progression, une sauvegarde automatique (navigateur + serveur). Les réponses sont reliées à la fiche du
 * posteur par l'OS (email, email Ruul ou @ TikTok).
 */
export function PageQuestionnaire() {
  const { slug = "" } = useParams();
  // 16/11 (Max) : « Do the star survey » en test (?test=1) : le vrai questionnaire, mais rien n'est enregistré.
  const test = useSearchParams()[0].get("test") === "1";
  const cle = test ? `${slug}-test` : slug;
  const jeton = React.useMemo(() => jetonNavigateur(cle), [cle]);
  const [b, setB] = React.useState<Brouillon>(() => lireBrouillonLocal(cle) ?? VIDE);
  const sauver = React.useCallback(
    (x: Brouillon, termine: boolean) => (test ? Promise.resolve({ ok: true as const }) : sauverReponses(slug, jeton, x, termine)),
    [test, slug, jeton],
  );
  const [statut, setStatut] = React.useState<"" | "enregistrement" | "enregistre" | "erreur">("");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const total = SECTIONS.length + 1;
  const sale = React.useRef(false);

  // Sauvegarde automatique : à chaque changement dans le navigateur, et 2 s après sur le serveur.
  React.useEffect(() => {
    ecrireBrouillonLocal(cle, b);
    if (!sale.current || !b.identite.email) return;
    const t = setTimeout(() => {
      setStatut("enregistrement");
      sauver(b, b.termine).then(() => setStatut("enregistre")).catch(() => setStatut("erreur"));
      sale.current = false;
    }, 2000);
    return () => clearTimeout(t);
  }, [b, cle, sauver]);

  const changer = (f: (x: Brouillon) => Brouillon) => {
    sale.current = true;
    setB((x) => f(x));
  };
  const repondre = (id: string, v: string | string[] | undefined) => changer((x) => ({ ...x, reponses: { ...x.reponses, [id]: v } }));
  const aller = async (ecran: number, termine = false) => {
    setErreur(null);
    const suivant = { ...b, ecran, termine: termine || b.termine };
    setB(suivant);
    document.documentElement.scrollTop = 0;
    try {
      setStatut("enregistrement");
      await sauver(suivant, termine || b.termine);
      sale.current = false;
      setStatut("enregistre");
    } catch (e) {
      setStatut("erreur");
      if (termine) setErreur((e as Error).message);
    }
  };

  const ecran = Math.min(b.ecran, total);
  const identiteOk = b.identite.nom.trim().length >= 2 && EMAIL.test(b.identite.email.trim()) && b.identite.tiktok.replace(/^@+/, "").trim().length >= 2;

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 sm:py-10" data-testid="questionnaire">
      <div className="mx-auto max-w-xl space-y-4">
        {test && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-xs dark:bg-amber-950/40 dark:text-amber-200" data-testid="mode-test">
            <span className="flex-1">TEST MODE: nothing is saved or sent.</span>
            <button type="button" className="underline" onClick={() => { sale.current = false; setB(VIDE); setStatut(""); }}>Restart</button>
          </div>
        )}
        <header className="space-y-2">
          <p className="font-semibold text-muted-foreground text-sm">Vik Studios</p>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={ecran}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((ecran / total) * 100)}%` }} />
          </div>
          <p className="flex justify-between text-muted-foreground text-xs">
            <span>{ecran >= total ? "Done" : `Step ${ecran + 1} of ${total}`}</span>
            <span data-testid="sauvegarde">
              {statut === "enregistrement" ? "Saving…" : statut === "enregistre" ? "Saved ✓" : statut === "erreur" ? "Not saved yet (we'll retry)" : ""}
            </span>
          </p>
        </header>

        <section className="space-y-5 rounded-xl border bg-background p-5 shadow-sm sm:p-6">
          {ecran === 0 && (
            <>
              <h1 className="font-semibold text-xl">A few questions about your account</h1>
              <p className="text-sm leading-relaxed">{INTRO}</p>
              <Champ libelle="First name and last name">
                <Input value={b.identite.nom} autoComplete="name" onChange={(e) => changer((x) => ({ ...x, identite: { ...x.identite, nom: e.target.value } }))} />
              </Champ>
              <Champ libelle="Email" aide="The one you use with us (or for Ruul).">
                <Input type="email" value={b.identite.email} autoComplete="email" onChange={(e) => changer((x) => ({ ...x, identite: { ...x.identite, email: e.target.value } }))} />
              </Champ>
              <Champ libelle="Your TikTok @">
                <Input value={b.identite.tiktok} placeholder="@username" autoCapitalize="none" onChange={(e) => changer((x) => ({ ...x, identite: { ...x.identite, tiktok: e.target.value } }))} />
              </Champ>
              <Navigation suivant={() => aller(1)} suivantOk={identiteOk} manque={identiteOk ? null : "Please fill in your name, email and TikTok @."} />
            </>
          )}

          {ecran >= 1 && ecran <= SECTIONS.length && (() => {
            const s = SECTIONS[ecran - 1]!;
            const manque = manquantes(s, b.reponses);
            return (
              <>
                <h2 className="font-semibold text-lg">{s.titre}</h2>
                {s.questions.filter((q) => visible(q, b.reponses)).map((q) => (
                  <QuestionChamp
                    key={q.id}
                    q={q}
                    r={b.reponses}
                    repondre={repondre}
                    captures={b.captures[q.id] ?? []}
                    envoyer={async (f) => {
                      const chemin = test ? `test/${f.name}` : await envoyerCapture(slug, jeton, q.id, f);
                      changer((x) => ({ ...x, captures: { ...x.captures, [q.id]: [...(x.captures[q.id] ?? []), chemin] } }));
                    }}
                  />
                ))}
                <Navigation
                  retour={() => aller(ecran - 1)}
                  suivant={() => aller(ecran + 1, ecran === SECTIONS.length)}
                  suivantOk={manque.length === 0}
                  libelleSuivant={ecran === SECTIONS.length ? "Send my answers" : "Next"}
                  manque={manque.length ? `Please answer: ${manque.map((q) => q.n).filter((n, i, a) => a.indexOf(n) === i).join(", ")}` : null}
                />
                {erreur && <p className="text-destructive text-sm">{erreur}</p>}
              </>
            );
          })()}

          {ecran > SECTIONS.length && (
            <div className="space-y-2 py-6 text-center" data-testid="merci">
              <p className="text-4xl">🙏</p>
              <h2 className="font-semibold text-xl">{MERCI}</h2>
              <p className="text-muted-foreground text-sm">Your answers have been sent. You can close this page.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Champ({ libelle, aide, children }: { libelle: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-medium text-sm">{libelle}</span>
      {children}
      {aide && <span className="block text-muted-foreground text-xs">{aide}</span>}
    </label>
  );
}

function Navigation(p: { retour?: () => void; suivant: () => void; suivantOk: boolean; libelleSuivant?: string; manque: string | null }) {
  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center gap-2">
        {p.retour && <Button variant="outline" onClick={p.retour}>Back</Button>}
        <Button className="ml-auto" disabled={!p.suivantOk} onClick={p.suivant} data-testid="suivant">{p.libelleSuivant ?? "Next"}</Button>
      </div>
      {p.manque && <p className="text-right text-muted-foreground text-xs">{p.manque}</p>}
    </div>
  );
}

function QuestionChamp(p: {
  q: Question;
  r: Reponses;
  repondre: (id: string, v: string | string[] | undefined) => void;
  captures: string[];
  envoyer: (f: File) => Promise<void>;
}) {
  const { q, r, repondre } = p;
  const titre = (
    <p className="font-medium text-sm">
      <span className="text-muted-foreground">{q.n}. </span>
      {q.texte}
      {q.optionnel && <span className="font-normal text-muted-foreground"> (optional)</span>}
    </p>
  );
  const v = r[q.id];
  return (
    <div className="space-y-2" data-testid={`q-${q.id}`}>
      {titre}
      {q.type === "choix" && (
        <div className="flex flex-wrap gap-2">
          {q.options!.map((o) => (
            <Pastille key={o} actif={v === o} onClick={() => repondre(q.id, v === o ? undefined : o)}>{o}</Pastille>
          ))}
        </div>
      )}
      {q.type === "multi" && (
        <div className="flex flex-wrap gap-2">
          {q.options!.map((o) => {
            const liste = Array.isArray(v) ? v : [];
            const pris = liste.includes(o);
            return (
              <Pastille key={o} actif={pris} coche onClick={() => repondre(q.id, pris ? liste.filter((x) => x !== o) : [...liste, o])}>{o}</Pastille>
            );
          })}
        </div>
      )}
      {q.type === "texte" && (LONGS.has(q.id)
        ? <Textarea rows={3} value={typeof v === "string" ? v : ""} onChange={(e) => repondre(q.id, e.target.value)} aria-label={q.texte} />
        : <Input value={typeof v === "string" ? v : ""} onChange={(e) => repondre(q.id, e.target.value)} aria-label={q.texte} />)}
      {q.type === "pays" && (
        <select
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={typeof v === "string" ? v : ""}
          onChange={(e) => repondre(q.id, e.target.value || undefined)}
          aria-label={q.texte}
        >
          <option value="">Choose…</option>
          {(q.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          {listePays().map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {q.detail && (
        <Input
          placeholder={q.detail.libelle}
          aria-label={q.detail.libelle}
          value={typeof r[q.detail.id] === "string" ? (r[q.detail.id] as string) : ""}
          onChange={(e) => repondre(q.detail!.id, e.target.value)}
        />
      )}
      {q.type === "capture" && <Capture guide={q.guide ?? ""} n={p.captures.length} envoyer={p.envoyer} />}
    </div>
  );
}

function Pastille({ actif, coche, onClick, children }: { actif: boolean; coche?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        actif ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
      )}
    >
      {coche && (actif ? "✓ " : "")}{children}
    </button>
  );
}

function Capture({ guide, n, envoyer }: { guide: string; n: number; envoyer: (f: File) => Promise<void> }) {
  const [etat, setEtat] = React.useState<"" | "envoi" | "erreur">("");
  const [message, setMessage] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-muted-foreground text-xs leading-relaxed">📱 {guide}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setEtat("envoi");
            setMessage(null);
            try {
              await envoyer(f);
              setEtat("");
            } catch (err) {
              setEtat("erreur");
              setMessage((err as Error).message);
            }
          }}
        />
        <Button variant="outline" size="sm" disabled={etat === "envoi" || n >= 3} onClick={() => ref.current?.click()}>
          {etat === "envoi" ? "Uploading…" : n ? "Add another screenshot" : "Upload a screenshot"}
        </Button>
        {n > 0 && <span className="text-success text-xs">✓ {n} screenshot{n > 1 ? "s" : ""} received</span>}
      </div>
      {message && <p className="text-destructive text-xs">{message}</p>}
    </div>
  );
}
