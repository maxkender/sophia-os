import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";

import {
  actionPosteur,
  CATEGORIES_PROBLEME,
  cleCategorie,
  demandeOuverte,
  deposerCapture,
  filChat,
  lireDemandesDe,
  lireMaPlateforme,
  lireMesDemandes,
  type MaDemande,
  type Plateforme,
  poserQuestion,
  signalerProbleme,
} from "./api";

const H = "support.help";

/**
 * 0671 : « Help », la page d'aide du posteur. Deux boutons : « Ask a question »
 * (le bot répond tout de suite, puis « This solved it » / « I still need help »)
 * et « Report a problem » (catégorie, ce qui se passe, capture facultative).
 * Ses questions et ses problèmes, avec leur statut et le fil des réponses.
 * Tout en anglais ; « Ruul account » ou « Upwork contract » selon sa plateforme.
 */
/**
 * 12/11 (OS clair) : l'aperçu admin (Support › Aperçu posteur). La page exacte d'un posteur
 * réel ou fictif, en lecture seule : rien n'est envoyé, rien n'est écrit ; une question
 * passe par le bot en simulation.
 */
export interface ApercuHelp {
  cle: string;
  posterId: string | null;
  plateforme: Plateforme;
  simuler: (texte: string) => Promise<{ reponse: string; envoye_equipe: boolean }>;
}
const ApercuContexte = React.createContext<ApercuHelp | null>(null);

export function PageHelp({ apercu }: { apercu?: ApercuHelp } = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = apercu ? (apercu.posterId ?? "") : user?.id ?? "";
  const plateforme = useQuery({ queryKey: ["support", "plateforme", userId], queryFn: () => lireMaPlateforme(userId), enabled: !apercu && !!userId, staleTime: Infinity });
  const cleDemandes = apercu ? ["support", "apercu", apercu.cle] : ["support", "mes-demandes"];
  // 13/11 : la réponse de l'équipe apparaît dans le chat sans recharger la page.
  const demandes = useQuery({
    queryKey: cleDemandes,
    queryFn: () => (apercu ? (apercu.posterId ? lireDemandesDe(apercu.posterId) : Promise.resolve([])) : lireMesDemandes()),
    refetchInterval: apercu ? false : 30_000,
  });
  const [probleme, setProbleme] = React.useState(false);
  const pf: Plateforme = apercu?.plateforme ?? plateforme.data ?? "upwork";
  const rafraichir = () => qc.invalidateQueries({ queryKey: cleDemandes });
  const liste = demandes.data ?? [];

  return (
    <ApercuContexte.Provider value={apercu ?? null}>
    <div className="mx-auto max-w-2xl space-y-3" data-testid="page-help">
      <PageHeader title={t(`${H}.titre`)} description={t(`${H}.description`)} />
      {demandes.error && <p className="text-sm text-destructive">{(demandes.error as Error).message}</p>}
      <Chat demandes={liste} onChange={rafraichir} onProbleme={() => setProbleme(true)} />
      {probleme && <FormProbleme plateforme={pf} userId={userId} onFini={() => { setProbleme(false); void rafraichir(); }} />}
    </div>
    </ApercuContexte.Provider>
  );
}

const heure = (at: string) => new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * 13/11 (Max) : Help en chat. Le posteur à droite, « Vik Studios » à gauche ; « typing… » pendant
 * la réponse ; sous chaque réponse « 👍 Solved » / « I still need help » (→ l'équipe). Une demande
 * encore ouverte : le message part dans son fil ; sinon c'est une nouvelle question.
 */
function Chat({ demandes, onChange, onProbleme }: { demandes: MaDemande[]; onChange: () => void; onProbleme: () => void }) {
  const { t } = useTranslation();
  const apercu = React.useContext(ApercuContexte);
  const [texte, setTexte] = React.useState("");
  const [enAttente, setEnAttente] = React.useState<string | null>(null);
  const [simulees, setSimulees] = React.useState<{ q: string; r: string }[]>([]);
  const [nouvelle, setNouvelle] = React.useState(false);
  const bas = React.useRef<HTMLDivElement>(null);
  const ouverte = nouvelle ? null : demandeOuverte(demandes);
  const groupes = filChat(demandes);

  const envoi = useMutation({
    mutationFn: async (q: string) => {
      if (apercu) {
        const r = await apercu.simuler(q);
        setSimulees((s) => [...s, { q, r: r.reponse }]);
        return;
      }
      if (ouverte) await actionPosteur(ouverte.id, "repondre", q);
      else await poserQuestion(q);
    },
    onMutate: (q) => { setEnAttente(q); setTexte(""); },
    onSettled: () => { setEnAttente(null); setNouvelle(false); onChange(); },
  });
  const suite = useMutation({ mutationFn: (p: { id: string; a: "resolu" | "aide" }) => actionPosteur(p.id, p.a), onSuccess: onChange });

  React.useEffect(() => { bas.current?.scrollIntoView?.({ block: "end" }); }, [demandes.length, enAttente, simulees.length]);
  const envoyer = () => { const q = texte.trim(); if (q.length >= 2 && !envoi.isPending) envoi.mutate(q); };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-background" data-testid="chat-help">
      <div className="flex max-h-[60vh] min-h-[320px] flex-col gap-2 overflow-y-auto bg-muted/30 p-3" data-testid="fil-chat">
        {groupes.length === 0 && simulees.length === 0 && !enAttente && (
          <Bulle cote="eux" texte={t(`${H}.accueil`)} />
        )}
        {groupes.map((g) => (
          <div key={g.demande.id} className="flex flex-col gap-2" data-testid="groupe-chat">
            {g.bulles.map((b) => <Bulle key={b.cle} cote={b.cote} texte={b.texte} at={b.at} />)}
            {g.choix && !apercu && (
              <div className="flex flex-wrap gap-2 pl-1" data-testid="choix-chat">
                <Button size="sm" variant="outline" className="h-7 rounded-full" disabled={suite.isPending} onClick={() => suite.mutate({ id: g.demande.id, a: "resolu" })}>
                  {t(`${H}.resolu`)}
                </Button>
                <Button size="sm" variant="outline" className="h-7 rounded-full" disabled={suite.isPending} onClick={() => suite.mutate({ id: g.demande.id, a: "aide" })}>
                  {t(`${H}.aide`)}
                </Button>
              </div>
            )}
            {g.chezEquipe && <p className="self-center rounded-full border border-amber-300 bg-amber-50 px-3 py-0.5 text-amber-800 text-xs dark:bg-amber-950/40 dark:text-amber-200" data-testid="chez-equipe">{t(`${H}.envoyeEquipe`)}</p>}
            {g.demande.statut === "resolu" && <p className="self-center text-muted-foreground text-xs">{t(`${H}.statuts.resolu`)}</p>}
          </div>
        ))}
        {simulees.map((s, i) => (
          <React.Fragment key={i}><Bulle cote="moi" texte={s.q} /><Bulle cote="eux" texte={s.r} /></React.Fragment>
        ))}
        {enAttente && (
          <>
            <Bulle cote="moi" texte={enAttente} />
            <p className="pl-2 text-muted-foreground text-xs italic" data-testid="typing">{t(`${H}.typing`)}</p>
          </>
        )}
        {envoi.error && <p className="text-destructive text-xs">{(envoi.error as Error).message}</p>}
        <div ref={bas} />
      </div>
      {ouverte && (
        <p className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-3 py-1.5 text-muted-foreground text-xs" data-testid="reponse-a">
          {t(`${H}.repondreA`)}
          <button type="button" className="underline" onClick={() => setNouvelle(true)}>{t(`${H}.nouvelleQuestion`)}</button>
        </p>
      )}
      <form className="flex gap-2 border-t p-2" onSubmit={(e) => { e.preventDefault(); envoyer(); }}>
        <Textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
          placeholder={t(`${H}.questionPlaceholder`)}
          rows={1}
          className="min-h-10 resize-none rounded-2xl"
          data-testid="saisie-chat"
        />
        <Button type="submit" disabled={texte.trim().length < 2 || envoi.isPending} data-testid="envoyer-chat">{t(`${H}.envoyer`)}</Button>
      </form>
      <button type="button" className="border-t px-3 py-2 text-left text-muted-foreground text-xs underline-offset-2 hover:underline" onClick={onProbleme} data-testid="help-signaler">
        {t(`${H}.signalerCapture`)}
      </button>
    </div>
  );
}

function Bulle({ cote, texte, at }: { cote: "moi" | "eux"; texte: string; at?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cote === "moi" ? "flex flex-col items-end" : "flex flex-col items-start"} data-testid={`bulle-${cote}`}>
      <span className="px-1 text-[11px] text-muted-foreground">{cote === "moi" ? t(`${H}.auteurs.posteur`) : "Vik Studios"}{at ? ` · ${heure(at)}` : ""}</span>
      <p
        className={
          cote === "moi"
            ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground text-sm"
            : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border bg-background px-3 py-2 text-sm"
        }
      >
        {texte}
      </p>
    </div>
  );
}

function FormProbleme({ plateforme, userId, onFini }: { plateforme: Plateforme; userId: string; onFini: () => void }) {
  const { t } = useTranslation();
  const apercu = React.useContext(ApercuContexte);
  const [categorie, setCategorie] = React.useState<string>("");
  const [texte, setTexte] = React.useState("");
  const [fichier, setFichier] = React.useState<File | null>(null);
  const envoi = useMutation({
    mutationFn: async () => {
      const capture = fichier && userId ? await deposerCapture(fichier, userId) : null;
      return signalerProbleme({ categorie, texte: texte.trim(), capture });
    },
    onSuccess: onFini,
  });
  return (
    <Card data-testid="form-probleme">
      <CardContent className="space-y-3 p-4 text-sm">
        <fieldset className="space-y-1">
          <legend className="font-medium">{t(`${H}.categorie`)}</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES_PROBLEME.map((c) => (
              <Button key={c} size="sm" type="button" variant={categorie === c ? "default" : "outline"} onClick={() => setCategorie(c)} data-testid={`categorie-${c}`}>
                {t(`${H}.categories.${cleCategorie(c, plateforme)}`)}
              </Button>
            ))}
          </div>
        </fieldset>
        <label className="block space-y-1">
          <span className="font-medium">{t(`${H}.quoi`)}</span>
          <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={t(`${H}.quoiPlaceholder`)} rows={4} />
        </label>
        <label className="block space-y-1">
          <span className="font-medium">{t(`${H}.capture`)}</span>
          <input type="file" accept="image/*" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} className="block text-sm" />
        </label>
        <Button disabled={!!apercu || !categorie || texte.trim().length < 3 || envoi.isPending} onClick={() => envoi.mutate()}>
          {envoi.isPending ? t(`${H}.envoi`) : t(`${H}.envoyer`)}
        </Button>
        {apercu && <p className="text-xs text-muted-foreground">Aperçu : un problème n'est pas envoyé depuis l'aperçu.</p>}
        {envoi.error && <p className="text-destructive">{(envoi.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

