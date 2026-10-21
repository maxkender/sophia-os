import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { aDejaPublie, etatOnboarding, mesNudges, mesReviewsNonVues } from "@/features/moteur/api";
import { cn } from "@/lib/utils";

import {
  checklistFaite,
  manquants,
  marquerChecklistFaite,
  QUESTIONS_PREMIER_POST,
  sansLesNon,
  TEXTES_PREMIER_POST as T,
  toutRepondu,
  type Reponse,
  type Reponses,
} from "./premierPost";

/**
 * Checklist bloquante avant le tout premier post (voir `premierPost.ts`).
 * Montée par la page du post : elle passe avant les boutons d'enregistrement.
 *
 * Réservée au VRAI poster qui n'a jamais publié : l'admin qui ouvre un post ne
 * la voit pas. Un pop-up à la fois : elle attend l'onboarding, les retours et
 * les messages, montés par `PosterLayout`. Une lecture ratée ne bloque
 * personne : c'est un garde-fou, pas un contrôle.
 */
export function ChecklistPremierPost() {
  const { roleReel, user } = useAuth();
  if (roleReel !== "poster" || !user) return null;
  return <ChecklistSiNouveau uid={user.id} />;
}

function ChecklistSiNouveau({ uid }: { uid: string }) {
  const [faite, setFaite] = React.useState(() => checklistFaite(uid));
  const publie = useQuery({ queryKey: ["a-deja-publie"], queryFn: aDejaPublie, enabled: !faite });
  const onboarding = useQuery({ queryKey: ["onboarding-etat"], queryFn: etatOnboarding, enabled: !faite });
  const reviews = useQuery({ queryKey: ["mes-reviews"], queryFn: mesReviewsNonVues, enabled: !faite });
  const nudges = useQuery({ queryKey: ["mes-nudges"], queryFn: mesNudges, enabled: !faite });

  if (faite || publie.data !== false) return null;
  const apres =
    onboarding.isPending ||
    onboarding.data?.vu === false ||
    reviews.isPending ||
    (reviews.data?.length ?? 0) > 0 ||
    nudges.isPending ||
    (nudges.data?.length ?? 0) > 0;
  if (apres) return null;

  return (
    <ChecklistPremierPostDialog
      onTermine={() => {
        marquerChecklistFaite(uid);
        setFaite(true);
      }}
    />
  );
}

/**
 * Le pop-up lui-même. `simulation` (page Tests) : bandeau « aperçu », la croix
 * revient, et rien n'est retenu.
 */
export function ChecklistPremierPostDialog({
  simulation = false,
  onTermine,
}: {
  simulation?: boolean;
  onTermine: () => void;
}) {
  const [reponses, setReponses] = React.useState<Reponses>({});
  const [stop, setStop] = React.useState(false);
  const aFaire = manquants(reponses);

  const repondre = (cle: keyof Reponses, r: Reponse) => setReponses((avant) => ({ ...avant, [cle]: r }));
  const continuer = () => {
    if (aFaire.length > 0) setStop(true);
    else onTermine();
  };
  const recommencer = () => {
    setReponses(sansLesNon(reponses));
    setStop(false);
  };

  return (
    <Dialog open disablePointerDismissal={!simulation}>
      <DialogPopup
        showCloseButton={simulation}
        closeProps={simulation ? { onClick: onTermine } : undefined}
        className="max-w-lg"
        onKeyDown={simulation ? undefined : (e) => {
          if (e.key === "Escape") e.preventDefault();
        }}
      >
        <DialogPanel className="space-y-5 p-6">
          {simulation && (
            <span className="inline-block rounded-md bg-warning/20 px-2 py-0.5 font-medium text-warning-foreground text-xs">
              {T.apercu}
            </span>
          )}

          {stop ? (
            <div className="space-y-5 rounded-xl border-2 border-destructive bg-destructive/10 p-5 text-destructive">
              <div className="flex items-start gap-3">
                <Ban className="size-8 shrink-0" />
                <DialogTitle className="font-extrabold text-2xl leading-tight">{T.stopTitre}</DialogTitle>
              </div>
              <ul className="list-disc space-y-2 pl-6 font-bold text-lg">
                {aFaire.map((q) => (
                  <li key={q.cle}>{q.action}</li>
                ))}
              </ul>
              <p className="font-extrabold text-lg uppercase">{T.stopRisque}</p>
              <Button size="lg" variant="destructive" className="w-full" onClick={recommencer}>
                {T.stopRetour}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <ShieldAlert className="size-8 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <DialogTitle className="font-extrabold text-2xl leading-tight">{T.titre}</DialogTitle>
                  <p className="font-semibold text-muted-foreground">{T.intro}</p>
                </div>
              </div>
              <ol className="space-y-3">
                {QUESTIONS_PREMIER_POST.map((q, i) => (
                  <li key={q.cle} className="space-y-2 rounded-lg border p-3">
                    <p className="font-bold">
                      {i + 1}. {q.question}
                    </p>
                    <div className="flex gap-2" role="radiogroup" aria-label={q.question}>
                      {(["oui", "non"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={reponses[q.cle] === r}
                          onClick={() => repondre(q.cle, r)}
                          className={cn(
                            "flex-1 rounded-md border-2 px-3 py-2 font-bold",
                            reponses[q.cle] === r
                              ? r === "oui"
                                ? "border-success bg-success/15 text-success"
                                : "border-destructive bg-destructive/15 text-destructive"
                              : "border-border",
                          )}
                        >
                          {r === "oui" ? T.oui : T.non}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
              <Button size="lg" className="w-full" disabled={!toutRepondu(reponses)} onClick={continuer}>
                {T.continuer}
              </Button>
            </>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
