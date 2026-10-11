import * as React from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { enregistrerOnboardingEtape, marquerOnboardingVu } from "@/features/moteur/api";

import { ECRANS, QUESTIONS, type Bloc } from "./contenu";
import {
  corrigerQuiz,
  etapeDeReprise,
  indexEcran,
  INDEX_QUIZ,
  NB_ETAPES,
  peutAvancer,
  secondesRestantes,
  type CorrectionQuiz,
} from "./parcours";

function BlocVue({ bloc }: { bloc: Bloc }) {
  switch (bloc.type) {
    case "p":
      return <p className="text-sm leading-relaxed">{bloc.texte}</p>;
    case "titre":
      return <h3 className="pt-1 font-semibold text-sm tracking-tight">{bloc.texte}</h3>;
    case "liste":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          {bloc.items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      );
    case "etapes":
      return (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
          {bloc.items.map((i) => <li key={i}>{i}</li>)}
        </ol>
      );
    case "alerte":
      return (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm leading-relaxed",
            bloc.ton === "rouge"
              ? "border-destructive/50 bg-destructive/10"
              : "border-warning/50 bg-warning/10",
          )}
        >
          {bloc.titre && <p className="mb-1.5 font-semibold">{bloc.titre}</p>}
          {bloc.items.length === 1
            ? <p className="font-medium">{bloc.items[0]}</p>
            : (
              <ul className="list-disc space-y-1 pl-5">
                {bloc.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
            )}
        </div>
      );
    case "video":
      return (
        <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
          <iframe src={bloc.src} title={bloc.titre} allowFullScreen className="size-full" />
        </div>
      );
    case "lien":
      return (
        <p className="text-sm leading-relaxed">
          {bloc.avant && <span className="text-muted-foreground">{bloc.avant} </span>}
          <a
            href={bloc.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2"
          >
            <BookOpen className="size-3.5" />
            {bloc.libelle}
          </a>
        </p>
      );
  }
}

function Quiz({
  reponses,
  onRepondre,
  verdict,
}: {
  reponses: Record<string, number | undefined>;
  onRepondre: (cle: string, index: number) => void;
  verdict: CorrectionQuiz | null;
}) {
  const ratees = new Set((verdict?.fausses ?? []).map((q) => q.cle));
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm leading-relaxed">
        Four quick questions, to be sure nothing important was missed. You need all four right.
      </p>
      {QUESTIONS.map((q, n) => (
        <fieldset key={q.cle} className="space-y-2">
          <legend
            className={cn(
              "font-medium text-sm",
              verdict && ratees.has(q.cle) && "text-destructive",
            )}
          >
            {n + 1}. {q.question}
          </legend>
          {q.options.map((option, index) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm transition-colors",
                reponses[q.cle] === index ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name={q.cle}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                checked={reponses[q.cle] === index}
                onChange={() => onRepondre(q.cle, index)}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/**
 * Le parcours d'accueil d'un créateur slideshow : six écrans puis un quiz.
 *
 * Il ne se ferme pas : ni croix, ni Échap, ni clic à côté. « Next » reste
 * verrouillé tant que l'écran n'a pas été déroulé jusqu'en bas ET que son
 * attente n'est pas purgée (`Ecran.attente`) ; le bouton affiche le décompte,
 * sinon il passerait pour cassé. Le quiz final est le vrai verrou : quatre
 * questions, une faute renvoie à l'écran concerné.
 *
 * `simulation` : l'aperçu admin. Rien n'est écrit en base et la croix revient,
 * sinon on enfermerait l'admin dans l'accueil d'un créateur.
 */
export function OnboardingParcours({
  etapeInitiale = 0,
  simulation = false,
  onTermine,
}: {
  etapeInitiale?: number;
  simulation?: boolean;
  onTermine?: () => void;
}) {
  const [etape, setEtape] = React.useState(() => etapeDeReprise(etapeInitiale));
  const [ecoulees, setEcoulees] = React.useState(0);
  const [basAtteint, setBasAtteint] = React.useState(false);
  const [reponses, setReponses] = React.useState<Record<string, number | undefined>>({});
  const [verdict, setVerdict] = React.useState<CorrectionQuiz | null>(null);
  const [termine, setTermine] = React.useState(false);
  const corps = React.useRef<HTMLDivElement>(null);

  const surQuiz = etape >= INDEX_QUIZ;
  const ecran = surQuiz ? null : ECRANS[etape];
  const attente = ecran?.attente ?? 0;

  // Changement d'écran : on repart du haut, le chrono redémarre, et un écran
  // trop court pour défiler est « lu » d'emblée — sinon son bouton ne
  // s'ouvrirait jamais, faute de scroll possible.
  React.useLayoutEffect(() => {
    setEcoulees(0);
    setBasAtteint(false);
    const el = corps.current;
    if (!el) return;
    el.scrollTop = 0;
    const id = requestAnimationFrame(() => {
      if (el.scrollHeight - el.clientHeight <= 4) setBasAtteint(true);
    });
    return () => cancelAnimationFrame(id);
  }, [etape]);

  React.useEffect(() => {
    if (surQuiz) return;
    const id = setInterval(() => setEcoulees((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [surQuiz]);

  const surScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 24) setBasAtteint(true);
  };

  const allerA = (n: number) => {
    setEtape(n);
    if (!simulation) void enregistrerOnboardingEtape(n);
  };

  const reste = secondesRestantes(ecoulees, attente);
  const ouvert = peutAvancer({ ecoulees, attente, basAtteint });

  const valider = () => {
    const resultat = corrigerQuiz(reponses);
    setVerdict(resultat);
    if (!resultat.reussi) return;
    setTermine(true);
    if (simulation) {
      onTermine?.();
      return;
    }
    void marquerOnboardingVu().then(() => onTermine?.());
  };

  const relire = () => {
    const cible = verdict?.ecranARelire ? indexEcran(verdict.ecranARelire) : -1;
    setVerdict(null);
    if (cible >= 0) setEtape(cible);
  };

  const progression = Math.round(((etape + 1) / NB_ETAPES) * 100);

  return (
    <Dialog open disablePointerDismissal={!simulation}>
      <DialogPopup
        showCloseButton={simulation}
        closeProps={simulation ? { onClick: () => onTermine?.() } : undefined}
        className="max-w-2xl"
        onKeyDown={simulation ? undefined : (e) => {
          if (e.key === "Escape") e.preventDefault();
        }}
      >
        <DialogHeader>
          {simulation && (
            <span className="w-fit rounded-md bg-warning/20 px-2 py-0.5 font-medium text-warning-foreground text-xs">
              Preview — nothing is saved
            </span>
          )}
          <DialogTitle className="text-base">
            {surQuiz ? "One last thing" : ecran?.titre}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${progression}%` }}
              />
            </div>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {etape + 1} / {NB_ETAPES}
            </span>
          </div>
        </DialogHeader>

        <div
          ref={corps}
          onScroll={surScroll}
          className="max-h-[56vh] space-y-3 overflow-y-auto px-6 py-1"
        >
          {surQuiz
            ? <Quiz reponses={reponses} onRepondre={(cle, i) => {
              setReponses((r) => ({ ...r, [cle]: i }));
              setVerdict(null);
            }} verdict={verdict} />
            : ecran?.blocs.map((bloc, i) => <BlocVue key={`${ecran.cle}-${i}`} bloc={bloc} />)}

          {surQuiz && verdict && !verdict.complet && (
            <p className="text-destructive text-sm">Please answer all four questions.</p>
          )}
          {surQuiz && verdict?.complet && !verdict.reussi && (
            <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <p className="font-medium">
                {verdict.fausses.length === 1
                  ? "One answer is not right."
                  : `${verdict.fausses.length} answers are not right.`}{" "}
                Let's read that part again.
              </p>
              <Button size="sm" variant="outline" onClick={relire}>
                <ArrowLeft />
                Re-read it
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="border-t">
          {etape > 0 && !termine && (
            <Button variant="ghost" onClick={() => setEtape(etape - 1)}>
              <ArrowLeft />
              Back
            </Button>
          )}
          {surQuiz
            ? (
              <Button onClick={valider} disabled={termine}>
                <CheckCircle2 />
                {termine ? "All good!" : "Finish"}
              </Button>
            )
            : (
              <Button onClick={() => allerA(etape + 1)} disabled={!ouvert}>
                {ouvert ? <ArrowRight /> : <Lock />}
                {reste > 0
                  ? `Next (${reste}s)`
                  : basAtteint
                  ? "Next"
                  : "Scroll to the bottom"}
              </Button>
            )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
