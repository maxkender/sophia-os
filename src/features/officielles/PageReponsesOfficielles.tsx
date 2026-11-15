import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  activerReponseOfficielle,
  enregistrerReponseOfficielle,
  lireReponsesOfficielles,
  validerReponseOfficielle,
  type ReponseOfficielle,
} from "./api";

const O = "officielles";

interface Brouillon {
  id: string | null;
  question: string;
  reponse: string;
  ordre: number;
}

const VIDE: Brouillon = { id: null, question: "", reponse: "", ordre: 200 };

/**
 * 6/11 : « Réponses officielles ». Une question, la réponse en anglais,
 * validée par Max. Le bot FAQ répond avec elle dans le fil de #questions, les
 * 3 bots la donnent en priorité, les posteurs la lisent sous « FAQ ». Toute
 * modification repasse « à valider » (la base y veille).
 */
export function PageReponsesOfficielles() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const liste = useQuery({ queryKey: ["officielles"], queryFn: lireReponsesOfficielles });
  const [b, setB] = React.useState<Brouillon>(VIDE);
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["officielles"] });

  const enregistrer = useMutation({
    mutationFn: (valider: boolean) => enregistrerReponseOfficielle({ ...b, valider }),
    onSuccess: () => { setB(VIDE); void rafraichir(); },
  });
  const valider = useMutation({ mutationFn: validerReponseOfficielle, onSuccess: rafraichir });
  const activer = useMutation({ mutationFn: (x: { id: string; actif: boolean }) => activerReponseOfficielle(x.id, x.actif), onSuccess: rafraichir });
  const pret = b.question.trim().length >= 3 && b.reponse.trim().length >= 3;
  const erreur = enregistrer.error ?? valider.error ?? activer.error ?? liste.error;

  const modifier = (r: ReponseOfficielle) => {
    setB({ id: r.id, question: r.question, reponse: r.reponse, ordre: r.ordre });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4" data-testid="page-officielles">
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <p className="font-medium">{b.id ? t(`${O}.modifier`) : t(`${O}.nouvelle`)}</p>
          <Input value={b.question} onChange={(e) => setB({ ...b, question: e.target.value })} placeholder={t(`${O}.question`)}
            data-testid="officielle-question" />
          <Textarea value={b.reponse} onChange={(e) => setB({ ...b, reponse: e.target.value })} rows={3}
            placeholder={t(`${O}.reponse`)} data-testid="officielle-reponse" />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!pret || enregistrer.isPending} onClick={() => enregistrer.mutate(true)} data-testid="officielle-valider">
              {t(`${O}.enregistrerValider`)}
            </Button>
            <Button size="sm" variant="outline" disabled={!pret || enregistrer.isPending} onClick={() => enregistrer.mutate(false)}>
              {t(`${O}.brouillon`)}
            </Button>
            {b.id && <Button size="sm" variant="ghost" onClick={() => setB(VIDE)}>{t(`${O}.annuler`)}</Button>}
            <span className="text-xs text-muted-foreground">{t(`${O}.aide`)}</span>
          </div>
        </CardContent>
      </Card>

      {erreur && <p className="text-sm text-destructive">{(erreur as Error).message}</p>}
      {liste.isLoading && <p className="text-sm text-muted-foreground">{t(`${O}.chargement`)}</p>}

      <ul className="space-y-2">
        {(liste.data ?? []).map((r) => (
          <li key={r.id} data-testid="officielle" className={r.actif ? "" : "opacity-60"}>
            <Card>
              <CardContent className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.question}</span>
                  {r.valide_at
                    ? <Badge variant="secondary">{t(`${O}.validee`)}</Badge>
                    : <Badge variant="outline" className="border-amber-400 text-amber-700">{t(`${O}.aValider`)}</Badge>}
                  {!r.actif && <Badge variant="outline">{t(`${O}.inactive`)}</Badge>}
                  <span className="ml-auto flex gap-1">
                    {!r.valide_at && <Button size="sm" onClick={() => valider.mutate(r.id)}>{t(`${O}.valider`)}</Button>}
                    <Button size="sm" variant="outline" onClick={() => modifier(r)}>{t(`${O}.modifier`)}</Button>
                    <Button size="sm" variant="ghost" onClick={() => activer.mutate({ id: r.id, actif: !r.actif })}>
                      {r.actif ? t(`${O}.desactiver`) : t(`${O}.activer`)}
                    </Button>
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{r.reponse}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
