import * as React from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { type Brouillon, ecrireBrouillonLocal, envoyerCapture, jetonNavigateur, lireBrouillonLocal, sauverReponses } from "./api";
import { assezLong, manquantes, nbCaptures, paysOptions, type Question, type Reponses, SECTIONS, visible } from "./questions";
import { dateLundi, type Traduire, useTextes } from "./textes";

const VIDE: Brouillon = { identite: { nom: "", email: "", tiktok: "" }, reponses: {}, captures: {}, ecran: 0, termine: false };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Le lundi qui suit aujourd'hui (aperçu du bonus en mode test). */
function lundiSuivant(d = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() + (8 - (x.getUTCDay() || 7)));
  return x.toISOString().slice(0, 10);
}

/**
 * 15/11 (Max) : le questionnaire public, par lien et sans connexion. Un écran par section, une barre
 * de progression, une sauvegarde automatique (navigateur + serveur). Les réponses sont reliées à la fiche du
 * posteur par l'OS (email, email Ruul ou @ TikTok). 20/11 : dans la langue du posteur (?lang=), bonus de 5 $ quand
 * il est terminé (obligatoires + au moins une capture).
 */
export function PageQuestionnaire() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  // 16/11 (Max) : « Do the star survey » en test (?test=1) : le vrai questionnaire, mais rien n'est enregistré.
  const test = params.get("test") === "1";
  // 20/11 (Max) : dans la langue du posteur (?lang=, mise par le pop-up : la langue de son compte), l'anglais par défaut.
  const { t, langue, dir } = useTextes(slug, params.get("lang"));
  const [bonusLundi, setBonusLundi] = React.useState<string | null>(null);
  const cle = test ? `${slug}-test` : slug;
  const jeton = React.useMemo(() => jetonNavigateur(cle), [cle]);
  const [b, setB] = React.useState<Brouillon>(() => lireBrouillonLocal(cle) ?? VIDE);
  const sauver = React.useCallback(
    (x: Brouillon, termine: boolean) =>
      test ? Promise.resolve({ ok: true as const, bonus_lundi: termine ? lundiSuivant() : null }) : sauverReponses(slug, jeton, x, termine, langue),
    [test, slug, jeton, langue],
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
      const r = await sauver(suivant, termine || b.termine);
      if (r.bonus_lundi) setBonusLundi(r.bonus_lundi);
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
    <main className="min-h-screen bg-muted/30 px-4 py-6 sm:py-10" data-testid="questionnaire" dir={dir} lang={langue}>
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
            <span>{ecran >= total ? t("ui.fini") : t("ui.etape", { n: ecran + 1, total })}</span>
            <span data-testid="sauvegarde">
              {statut === "enregistrement" ? t("ui.enregistrement") : statut === "enregistre" ? t("ui.enregistre") : statut === "erreur" ? t("ui.pas_enregistre") : ""}
            </span>
          </p>
        </header>

        <section className="space-y-5 rounded-xl border bg-background p-5 shadow-sm sm:p-6">
          {ecran === 0 && (
            <>
              <h1 className="font-semibold text-xl">{t("ui.titre")}</h1>
              <p className="font-medium text-sm leading-relaxed" data-testid="accroche-bonus">{t("ui.popup_titre")}</p>
              <p className="text-sm leading-relaxed">{t("ui.intro")}</p>
              <Champ libelle={t("ui.nom")}>
                <Input value={b.identite.nom} autoComplete="name" onChange={(e) => changer((x) => ({ ...x, identite: { ...x.identite, nom: e.target.value } }))} />
              </Champ>
              <Champ libelle={t("ui.email")} aide={t("ui.email_aide")}>
                <Input type="email" value={b.identite.email} autoComplete="email" onChange={(e) => changer((x) => ({ ...x, identite: { ...x.identite, email: e.target.value } }))} />
              </Champ>
              <Champ libelle={t("ui.tiktok")}>
                <Input value={b.identite.tiktok} placeholder="@username" autoCapitalize="none" onChange={(e) => changer((x) => ({ ...x, identite: { ...x.identite, tiktok: e.target.value } }))} />
              </Champ>
              <Navigation t={t} suivant={() => aller(1)} suivantOk={identiteOk} manque={identiteOk ? null : t("ui.identite_manque")} />
            </>
          )}

          {ecran >= 1 && ecran <= SECTIONS.length && (() => {
            const s = SECTIONS[ecran - 1]!;
            const manque = manquantes(s, b.reponses);
            const derniere = ecran === SECTIONS.length;
            // 20/11 (Max) : pour envoyer, au moins une capture.
            const sansCapture = derniere && nbCaptures(b.captures) < 1;
            const tropCourt = manque.find((q) => typeof b.reponses[q.id] === "string" && (b.reponses[q.id] as string).trim() && !assezLong(q, b.reponses[q.id]));
            return (
              <>
                <h2 className="font-semibold text-lg">{t(`s.${s.id}`)}</h2>
                {s.questions.filter((q) => visible(q, b.reponses)).map((q) => (
                  <QuestionChamp
                    key={q.id}
                    q={q}
                    t={t}
                    langue={langue}
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
                  t={t}
                  retour={() => aller(ecran - 1)}
                  suivant={() => aller(ecran + 1, derniere)}
                  suivantOk={manque.length === 0 && !sansCapture}
                  libelleSuivant={derniere ? t("ui.envoyer") : t("ui.suivant")}
                  manque={manque.length
                    ? [t("ui.a_repondre", { liste: manque.map((q) => q.n).filter((n, i, a) => a.indexOf(n) === i).join(", ") }),
                      tropCourt ? t("ui.trop_court", { min: tropCourt.min ?? 0 }) : null].filter(Boolean).join(" ")
                    : sansCapture ? t("ui.capture_manque") : null}
                />
                {erreur && <p className="text-destructive text-sm">{erreur}</p>}
              </>
            );
          })()}

          {ecran > SECTIONS.length && (
            <div className="space-y-2 py-6 text-center" data-testid="merci">
              <p className="text-4xl">🙏</p>
              <h2 className="font-semibold text-xl">{t("ui.merci")}</h2>
              {bonusLundi && <p className="font-medium text-sm" data-testid="merci-bonus">{t("ui.merci_bonus", { date: dateLundi(bonusLundi, langue) })}</p>}
              <p className="text-muted-foreground text-sm">{t("ui.merci_texte")}</p>
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

function Navigation(p: { t: Traduire; retour?: () => void; suivant: () => void; suivantOk: boolean; libelleSuivant?: string; manque: string | null }) {
  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center gap-2">
        {p.retour && <Button variant="outline" onClick={p.retour}>{p.t("ui.retour")}</Button>}
        <Button className="ms-auto" disabled={!p.suivantOk} onClick={p.suivant} data-testid="suivant">{p.libelleSuivant ?? p.t("ui.suivant")}</Button>
      </div>
      {p.manque && <p className="text-end text-muted-foreground text-xs" data-testid="manque">{p.manque}</p>}
    </div>
  );
}

function QuestionChamp(p: {
  q: Question;
  t: Traduire;
  langue: string;
  r: Reponses;
  repondre: (id: string, v: string | string[] | undefined) => void;
  captures: string[];
  envoyer: (f: File) => Promise<void>;
}) {
  const { q, r, repondre, t } = p;
  const texte = t(`q.${q.id}`);
  const option = (i: number) => t(`o.${q.id}.${i}`);
  const titre = (
    <p className="font-medium text-sm">
      <span className="text-muted-foreground">{q.n}. </span>
      {texte}
      {q.optionnel && <span className="font-normal text-muted-foreground"> {t("ui.optionnel")}</span>}
    </p>
  );
  const v = r[q.id];
  // Les choix gardent la valeur anglaise (la page admin et le CSV) ; seul le libellé est traduit.
  return (
    <div className="space-y-2" data-testid={`q-${q.id}`}>
      {titre}
      {q.aide && <p className="text-muted-foreground text-xs">{t(`a.${q.id}`)}</p>}
      {q.type === "choix" && (
        <div className="flex flex-wrap gap-2">
          {q.options!.map((o, i) => (
            <Pastille key={o} actif={v === o} onClick={() => repondre(q.id, v === o ? undefined : o)}>{option(i)}</Pastille>
          ))}
        </div>
      )}
      {q.type === "multi" && (
        <div className="flex flex-wrap gap-2">
          {q.options!.map((o, i) => {
            const liste = Array.isArray(v) ? v : [];
            const pris = liste.includes(o);
            return (
              <Pastille key={o} actif={pris} coche onClick={() => repondre(q.id, pris ? liste.filter((x) => x !== o) : [...liste, o])}>{option(i)}</Pastille>
            );
          })}
        </div>
      )}
      {q.type === "long" && (
        <Textarea rows={q.min ? 6 : 3} value={typeof v === "string" ? v : ""} onChange={(e) => repondre(q.id, e.target.value)} aria-label={texte} />
      )}
      {q.type === "texte" && <Input value={typeof v === "string" ? v : ""} onChange={(e) => repondre(q.id, e.target.value)} aria-label={texte} />}
      {q.min && typeof v === "string" && v.trim().length > 0 && v.trim().length < q.min && (
        <p className="text-muted-foreground text-xs">{t("ui.trop_court", { min: q.min })}</p>
      )}
      {q.type === "pays" && (
        <select
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={typeof v === "string" ? v : ""}
          onChange={(e) => repondre(q.id, e.target.value || undefined)}
          aria-label={texte}
        >
          <option value="">{t("ui.choisir")}</option>
          {(q.options ?? []).map((o, i) => <option key={o} value={o}>{option(i)}</option>)}
          {paysOptions(p.langue).map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
        </select>
      )}
      {q.detail && (
        <Input
          placeholder={t(`d.${q.id}`)}
          aria-label={t(`d.${q.id}`)}
          value={typeof r[q.detail.id] === "string" ? (r[q.detail.id] as string) : ""}
          onChange={(e) => repondre(q.detail!.id, e.target.value)}
        />
      )}
      {q.type === "capture" && <Capture t={t} guide={t(`g.${q.id}`)} n={p.captures.length} envoyer={p.envoyer} />}
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

function Capture({ t, guide, n, envoyer }: { t: Traduire; guide: string; n: number; envoyer: (f: File) => Promise<void> }) {
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
          {etat === "envoi" ? t("ui.capture_envoi") : n ? t("ui.capture_ajouter") : t("ui.capture_premiere")}
        </Button>
        {n > 0 && <span className="text-success text-xs">✓ {t("ui.capture_recue", { n })}</span>}
      </div>
      {message && <p className="text-destructive text-xs">{message}</p>}
    </div>
  );
}
