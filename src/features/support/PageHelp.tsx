import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";

import {
  actionPosteur,
  CATEGORIES_PROBLEME,
  cleCategorie,
  deposerCapture,
  lireMaPlateforme,
  lireMesDemandes,
  type MaDemande,
  type Plateforme,
  poserQuestion,
  signalerProbleme,
  statutPosteur,
} from "./api";

const H = "support.help";

/**
 * 0671 : « Help », la page d'aide du posteur. Deux boutons : « Ask a question »
 * (le bot répond tout de suite, puis « This solved it » / « I still need help »)
 * et « Report a problem » (catégorie, ce qui se passe, capture facultative).
 * Ses questions et ses problèmes, avec leur statut et le fil des réponses.
 * Tout en anglais ; « Ruul account » ou « Upwork contract » selon sa plateforme.
 */
export function PageHelp() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? "";
  const plateforme = useQuery({ queryKey: ["support", "plateforme", userId], queryFn: () => lireMaPlateforme(userId), enabled: !!userId, staleTime: Infinity });
  const demandes = useQuery({ queryKey: ["support", "mes-demandes"], queryFn: lireMesDemandes });
  const [mode, setMode] = React.useState<"question" | "probleme" | null>(null);
  const pf: Plateforme = plateforme.data ?? "upwork";
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["support", "mes-demandes"] });

  const liste = demandes.data ?? [];
  const questions = liste.filter((d) => d.type === "question");
  const problemes = liste.filter((d) => d.type === "probleme");

  return (
    <div className="space-y-4" data-testid="page-help">
      <PageHeader title={t(`${H}.titre`)} description={t(`${H}.description`)} />
      <div className="flex flex-wrap gap-2">
        <Button variant={mode === "question" ? "default" : "outline"} onClick={() => setMode("question")} data-testid="help-demander">
          {t(`${H}.demander`)}
        </Button>
        <Button variant={mode === "probleme" ? "default" : "outline"} onClick={() => setMode("probleme")} data-testid="help-signaler">
          {t(`${H}.signaler`)}
        </Button>
      </div>
      {mode === "question" && <FormQuestion onFini={rafraichir} />}
      {mode === "probleme" && <FormProbleme plateforme={pf} userId={userId} onFini={() => { setMode(null); void rafraichir(); }} />}
      {demandes.error && <p className="text-sm text-destructive">{(demandes.error as Error).message}</p>}
      <Liste titre={t(`${H}.mesProblemes`)} demandes={problemes} plateforme={pf} onChange={rafraichir} testid="mes-problemes" />
      <Liste titre={t(`${H}.mesQuestions`)} demandes={questions} plateforme={pf} onChange={rafraichir} testid="mes-questions" />
    </div>
  );
}

function FormQuestion({ onFini }: { onFini: () => void }) {
  const { t } = useTranslation();
  const [texte, setTexte] = React.useState("");
  const [fait, setFait] = React.useState<"resolu" | "aide" | null>(null);
  const envoi = useMutation({ mutationFn: () => poserQuestion(texte.trim()), onSuccess: () => { setFait(null); onFini(); } });
  const suite = useMutation({
    mutationFn: (a: "resolu" | "aide") => actionPosteur(envoi.data!.id!, a),
    onSuccess: (_d, a) => { setFait(a); onFini(); },
  });
  const r = envoi.data;
  return (
    <Card data-testid="form-question">
      <CardContent className="space-y-3 p-4 text-sm">
        <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={t(`${H}.questionPlaceholder`)} rows={3} />
        <Button disabled={texte.trim().length < 3 || envoi.isPending} onClick={() => envoi.mutate()}>
          {envoi.isPending ? t(`${H}.envoi`) : t(`${H}.envoyer`)}
        </Button>
        {envoi.error && <p className="text-destructive">{(envoi.error as Error).message}</p>}
        {r && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3" data-testid="reponse-bot">
            <p className="whitespace-pre-wrap">{r.reponse}</p>
            {!r.envoye_equipe && r.id && !fait && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => suite.mutate("resolu")} disabled={suite.isPending}>{t(`${H}.resolu`)}</Button>
                <Button size="sm" variant="outline" onClick={() => suite.mutate("aide")} disabled={suite.isPending}>{t(`${H}.aide`)}</Button>
              </div>
            )}
            {fait === "resolu" && <p className="text-muted-foreground">{t(`${H}.merciResolu`)}</p>}
            {fait === "aide" && <p className="text-muted-foreground">{t(`${H}.envoyeEquipe`)}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FormProbleme({ plateforme, userId, onFini }: { plateforme: Plateforme; userId: string; onFini: () => void }) {
  const { t } = useTranslation();
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
        <Button disabled={!categorie || texte.trim().length < 3 || envoi.isPending} onClick={() => envoi.mutate()}>
          {envoi.isPending ? t(`${H}.envoi`) : t(`${H}.envoyer`)}
        </Button>
        {envoi.error && <p className="text-destructive">{(envoi.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

function Liste({ titre, demandes, plateforme, onChange, testid }: {
  titre: string; demandes: MaDemande[]; plateforme: Plateforme; onChange: () => void; testid: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2" data-testid={testid}>
      <h2 className="text-base font-semibold">{titre}</h2>
      {demandes.length === 0 && <p className="text-sm text-muted-foreground">{t(`${H}.aucune`)}</p>}
      {demandes.map((d) => <Demande key={d.id} d={d} plateforme={plateforme} onChange={onChange} />)}
    </section>
  );
}

function Demande({ d, plateforme, onChange }: { d: MaDemande; plateforme: Plateforme; onChange: () => void }) {
  const { t } = useTranslation();
  const [texte, setTexte] = React.useState("");
  const statut = statutPosteur(d);
  const repondre = useMutation({ mutationFn: () => actionPosteur(d.id, "repondre", texte.trim()), onSuccess: () => { setTexte(""); onChange(); } });
  const suite = useMutation({ mutationFn: (a: "resolu" | "aide") => actionPosteur(d.id, a), onSuccess: onChange });
  const variante = statut === "resolu" ? "success" : statut === "en_cours" || statut === "repondu" ? "info" : "secondary";
  return (
    <Card data-testid="demande">
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {d.type === "probleme" && <Badge variant="outline">{t(`${H}.categories.${cleCategorie(d.categorie, plateforme)}`)}</Badge>}
          <Badge variant={variante} data-testid="statut">{t(`${H}.statuts.${statut}`)}</Badge>
          <span className="text-xs text-muted-foreground">{new Date(d.cree_at).toLocaleDateString("en-GB")}</span>
        </div>
        <p className="font-medium whitespace-pre-wrap">{d.texte}</p>
        <div className="space-y-1">
          {d.messages.map((m, i) => (
            <div key={i} className={m.auteur === "posteur" ? "rounded-md bg-muted/50 p-2" : "rounded-md border p-2"}>
              <p className="text-xs text-muted-foreground">{t(`${H}.auteurs.${m.auteur}`)}</p>
              <p className="whitespace-pre-wrap">{m.texte}</p>
            </div>
          ))}
        </div>
        {d.statut === "bot" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => suite.mutate("resolu")} disabled={suite.isPending}>{t(`${H}.resolu`)}</Button>
            <Button size="sm" variant="outline" onClick={() => suite.mutate("aide")} disabled={suite.isPending}>{t(`${H}.aide`)}</Button>
          </div>
        )}
        {d.statut !== "bot" && statut !== "resolu" && (
          <div className="flex gap-2">
            <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={t(`${H}.repondrePlaceholder`)} rows={2} />
            <Button size="sm" disabled={!texte.trim() || repondre.isPending} onClick={() => repondre.mutate()}>{t(`${H}.repondre`)}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
