import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  CLE_SITUATIONS,
  cleDepuisLibelle,
  creerEntree,
  creerSituation,
  ecrireModeSituations,
  type EntreeFaqSituation,
  lireModeSituationsAdmin,
  listerEntrees,
  majEntree,
  majSituation,
  type ModeSituations,
  retirerReponse,
  type Situation,
} from "./api";
import { EditeurReponse } from "./communs";
import { libelleSituation, messageErreur, useSituations } from "./outils";

/**
 * Prompt 21, Q : la FAQ par situation, à brancher dans la page FAQ bot.
 * Le mode (off / test / on), les questions et leurs réponses par situation
 * (plus une par défaut), et la liste des situations (ajouter, renommer,
 * désactiver).
 */
export function PanneauFaqSituations() {
  return (
    <div className="space-y-6" data-testid="faq-situations">
      <ModeSituationsCarte />
      <QuestionsParSituation />
      <ListeSituations />
    </div>
  );
}

const MODES: readonly ModeSituations[] = ["off", "test", "on"];

function ModeSituationsCarte() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mode = useQuery({ queryKey: [...CLE_SITUATIONS, "mode"], queryFn: lireModeSituationsAdmin });
  const ecrire = useMutation({
    mutationFn: (m: ModeSituations) => ecrireModeSituations(m),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE_SITUATIONS, "mode"] }),
  });
  return (
    <div className="space-y-1">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{t("faqSituations.mode")}</span>
        <select
          aria-label={t("faqSituations.mode")}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={mode.data ?? "test"}
          disabled={!mode.data || ecrire.isPending}
          onChange={(e) => {
            const m = e.target.value as ModeSituations;
            if (m === "on" && !window.confirm(t("faqSituations.confirmerOn"))) return;
            ecrire.mutate(m);
          }}
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {t(`faqSituations.modes.${m}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">{t(`faqSituations.modesAide.${mode.data ?? "test"}`)}</p>
      {(mode.error || ecrire.error) && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(mode.error ?? ecrire.error)}
        </p>
      )}
    </div>
  );
}

function QuestionsParSituation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const entrees = useQuery({ queryKey: [...CLE_SITUATIONS, "entrees"], queryFn: listerEntrees });
  const [nouvelle, setNouvelle] = React.useState("");
  const creer = useMutation({
    mutationFn: () => creerEntree(nouvelle),
    onSuccess: () => {
      setNouvelle("");
      void queryClient.invalidateQueries({ queryKey: CLE_SITUATIONS });
    },
  });
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{t("faqSituations.questionsTitre")}</h3>
        <p className="text-xs text-muted-foreground">{t("faqSituations.questionsAide")}</p>
      </div>
      {entrees.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {entrees.error && <p className="text-sm text-destructive">{messageErreur(entrees.error)}</p>}
      <div className="space-y-2">
        {(entrees.data ?? []).map((e) => (
          <Entree key={e.id} entree={e} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("faqSituations.nouvelleQuestion")}
          placeholder={t("faqSituations.nouvelleQuestion")}
          value={nouvelle}
          onChange={(e) => setNouvelle(e.target.value)}
          className="max-w-sm"
        />
        <Button size="sm" variant="outline" disabled={nouvelle.trim().length < 2 || creer.isPending} onClick={() => creer.mutate()}>
          <Plus />
          {t("faqSituations.ajouterQuestion")}
        </Button>
        {creer.error && <span className="text-xs text-destructive">{messageErreur(creer.error)}</span>}
      </div>
    </section>
  );
}

function Entree({ entree }: { entree: EntreeFaqSituation }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const situations = useSituations();
  const [ouverte, setOuverte] = React.useState(false);
  const [edition, setEdition] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState(entree.question);
  const [formulations, setFormulations] = React.useState(entree.formulations.join("\n"));
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: CLE_SITUATIONS });
  const maj = useMutation({
    mutationFn: (patch: Parameters<typeof majEntree>[1]) => majEntree(entree.id, patch),
    onSuccess: rafraichir,
  });
  const retirer = useMutation({ mutationFn: (id: string) => retirerReponse(id), onSuccess: rafraichir });
  const actives = entree.reponses.filter((r) => r.actif);
  // La défaut d'abord, puis une ligne par situation active (avec ou sans réponse).
  const lignes: Array<{ cle: string | null; libelle: string }> = [
    { cle: null, libelle: t("faqSituations.parDefaut") },
    ...(situations.data ?? []).filter((s) => s.actif).map((s) => ({ cle: s.cle, libelle: s.libelle })),
  ];
  const cleEdition = (c: string | null) => c ?? "*";

  return (
    <div className={cn("rounded-lg border", !entree.actif && "opacity-60")} data-testid={`faq-entree-${entree.cle ?? entree.id}`}>
      <button
        type="button"
        aria-expanded={ouverte}
        onClick={() => setOuverte(!ouverte)}
        className="flex w-full flex-wrap items-center gap-2 border-0 bg-transparent px-3 py-2 text-left"
      >
        <span className="text-sm font-medium">{entree.question}</span>
        <Badge variant="secondary">{t("faqSituations.nReponses", { count: actives.length })}</Badge>
        {!entree.actif && <Badge variant="outline">{t("faqSituations.desactivee")}</Badge>}
      </button>
      {ouverte && (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input aria-label={t("faqSituations.question")} value={question} onChange={(e) => setQuestion(e.target.value)} />
            <textarea
              aria-label={t("faqSituations.formulations")}
              placeholder={t("faqSituations.formulations")}
              className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
              rows={2}
              value={formulations}
              onChange={(e) => setFormulations(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={maj.isPending || question.trim().length < 2}
              onClick={() =>
                maj.mutate({ question: question.trim(), formulations: formulations.split("\n").map((f) => f.trim()).filter(Boolean) })}
            >
              {t("common.save")}
            </Button>
            <Button size="xs" variant="ghost" disabled={maj.isPending} onClick={() => maj.mutate({ actif: !entree.actif })}>
              {entree.actif ? t("faqSituations.desactiver") : t("faqSituations.activer")}
            </Button>
            {(maj.error || retirer.error) && (
              <span className="text-xs text-destructive">{messageErreur(maj.error ?? retirer.error)}</span>
            )}
          </div>
          <ul className="divide-y rounded-md border">
            {lignes.map((l) => {
              const r = actives.find((x) => x.situation === l.cle);
              const enEdition = edition === cleEdition(l.cle);
              return (
                <li key={cleEdition(l.cle)} className="space-y-1 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-xs font-medium", l.cle === null && "uppercase tracking-wide")}>{l.libelle}</span>
                    {!enEdition && (
                      <span className="ml-auto flex gap-1">
                        <Button size="xs" variant="ghost" onClick={() => setEdition(cleEdition(l.cle))}>
                          {r ? t("common.edit") : t("faqSituations.ajouterReponse")}
                        </Button>
                        {r && (
                          <Button size="xs" variant="ghost" disabled={retirer.isPending} onClick={() => retirer.mutate(r.id)}>
                            {t("faqSituations.retirer")}
                          </Button>
                        )}
                      </span>
                    )}
                  </div>
                  {enEdition ? (
                    <EditeurReponse
                      entreeId={entree.id}
                      question={entree.question}
                      situation={l.cle}
                      texteInitial={r?.texte ?? ""}
                      onFini={() => setEdition(null)}
                      onAnnuler={() => setEdition(null)}
                    />
                  ) : r ? (
                    <p className="whitespace-pre-wrap text-sm">{r.texte}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {l.cle === null ? t("faqSituations.sansDefaut") : t("faqSituations.sansReponse")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {/* Une réponse d'une situation désactivée ne sert plus : on la montre quand même. */}
          {actives
            .filter((r) => r.situation && !lignes.some((l) => l.cle === r.situation))
            .map((r) => (
              <p key={r.id} className="text-xs text-muted-foreground">
                {libelleSituation(r.situation, situations.data)} ({t("faqSituations.desactivee")}) : {r.texte}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

function ListeSituations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const situations = useSituations();
  const [libelle, setLibelle] = React.useState("");
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: CLE_SITUATIONS });
  const creer = useMutation({
    mutationFn: () =>
      creerSituation(libelle, null, Math.max(0, ...(situations.data ?? []).map((s) => s.ordre)) + 10),
    onSuccess: () => {
      setLibelle("");
      void rafraichir();
    },
  });
  const cle = cleDepuisLibelle(libelle);
  const existe = (situations.data ?? []).some((s) => s.cle === cle);
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{t("faqSituations.situationsTitre")}</h3>
        <p className="text-xs text-muted-foreground">{t("faqSituations.situationsAide")}</p>
      </div>
      <ul className="divide-y rounded-lg border">
        {(situations.data ?? []).map((s) => (
          <LigneSituation key={s.cle} s={s} onChange={rafraichir} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("faqSituations.nouvelleSituation")}
          placeholder={t("faqSituations.nouvelleSituation")}
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          className="max-w-sm"
        />
        <Button size="sm" variant="outline" disabled={cle.length < 2 || existe || creer.isPending} onClick={() => creer.mutate()}>
          <Plus />
          {t("faqSituations.ajouterSituation")}
        </Button>
        {existe && <span className="text-xs text-warning-foreground">{t("faqSituations.existeDeja")}</span>}
        {creer.error && <span className="text-xs text-destructive">{messageErreur(creer.error)}</span>}
      </div>
    </section>
  );
}

function LigneSituation({ s, onChange }: { s: Situation; onChange: () => void }) {
  const { t } = useTranslation();
  const [libelle, setLibelle] = React.useState(s.libelle);
  const maj = useMutation({
    mutationFn: (patch: Parameters<typeof majSituation>[1]) => majSituation(s.cle, patch),
    onSuccess: onChange,
  });
  return (
    <li className={cn("flex flex-wrap items-center gap-2 px-3 py-2", !s.actif && "opacity-60")}>
      <Input
        aria-label={t("faqSituations.renommer", { cle: s.cle })}
        value={libelle}
        onChange={(e) => setLibelle(e.target.value)}
        onBlur={() => {
          if (libelle.trim() && libelle.trim() !== s.libelle) maj.mutate({ libelle: libelle.trim() });
        }}
        className="h-8 max-w-xs"
      />
      <Badge variant={s.auto ? "secondary" : "outline"}>{s.auto ? t("faqSituations.auto") : t("faqSituations.manuelle")}</Badge>
      {s.description && <span className="text-xs text-muted-foreground">{s.description}</span>}
      <Button size="xs" variant="ghost" className="ml-auto" disabled={maj.isPending} onClick={() => maj.mutate({ actif: !s.actif })}>
        {s.actif ? t("faqSituations.desactiver") : t("faqSituations.activer")}
      </Button>
      {maj.error && <span className="text-xs text-destructive">{messageErreur(maj.error)}</span>}
    </li>
  );
}
