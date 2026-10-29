import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  IdCard,
  Lock,
  PartyPopper,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  enregistrerIdentiteRuul,
  enregistrerOnboardingEtape,
  lireCohorteAccueil,
  marquerOnboardingVu,
  mesComptes,
} from "@/features/moteur/api";
import { comptePrincipal } from "@/features/moteur/comptesCm";
import { partiesParis } from "@/features/onboarding/datesRuul";

import { Mico, type EtatMico } from "./Mico";
import { useRegles } from "@/features/regles/api";
import { RegleTexte } from "@/features/regles/CartesRegles";

import { jourAnglais, premierPostLe } from "./cinqEtapes";
import { lireMaPremiereSemaine } from "./cinqEtapesApi";
import { ecransPour, questionsPour, type Bloc, type ContexteAccueil, type Question } from "./contenu";
import {
  basDePageAtteint,
  corrigerQuiz,
  etapeDeReprise,
  indexEcran,
  INDEX_QUIZ,
  NB_ETAPES,
  peutAvancer,
  secondesRestantes,
  type CorrectionQuiz,
} from "./parcours";

/** Les blocs entrent les uns après les autres, pas tous d'un coup. */
const DECALAGE_MS = 70;

/** Un texte du parcours : les passages en **double étoile** sont en gras. */
function Riche({ texte }: { texte: string }) {
  const morceaux = texte.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {morceaux.map((m, i) =>
        i % 2 === 1 ? <strong key={i} className="font-semibold">{m}</strong> : <React.Fragment key={i}>{m}</React.Fragment>,
      )}
    </>
  );
}

function BlocVue({ bloc, rang }: { bloc: Bloc; rang: number }) {
  const anime = "animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-backwards";
  const style = { animationDelay: `${rang * DECALAGE_MS}ms` };

  switch (bloc.type) {
    case "p":
      return <p className={cn("text-sm leading-relaxed", anime)} style={style}><Riche texte={bloc.texte} /></p>;
    case "titre":
      return (
        <h3 className={cn("pt-1 font-semibold text-sm tracking-tight", anime)} style={style}>
          <Riche texte={bloc.texte} />
        </h3>
      );
    case "liste":
      return (
        <ul className={cn("space-y-1.5 text-sm leading-relaxed", anime)} style={style}>
          {bloc.items.map((i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
              <span><Riche texte={i} /></span>
            </li>
          ))}
        </ul>
      );
    case "etapes":
      return (
        <ol className={cn("space-y-2 text-sm leading-relaxed", anime)} style={style}>
          {bloc.items.map((i, n) => (
            <li key={i} className="flex gap-2.5">
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-[11px] text-primary tabular-nums"
              >
                {n + 1}
              </span>
              <span className="pt-px"><Riche texte={i} /></span>
            </li>
          ))}
        </ol>
      );
    case "alerte": {
      const vif = bloc.ton === "vif";
      return (
        <div
          className={cn(
            "rounded-xl border p-3 text-sm leading-relaxed shadow-sm",
            vif && "border-red-700 bg-red-600 p-4 text-base text-white shadow-lg ring-4 ring-red-600/25",
            bloc.ton === "rouge" && "border-destructive/50 bg-destructive/10",
            bloc.ton === "orange" && "border-warning/50 bg-warning/10",
            anime,
          )}
          style={style}
        >
          {bloc.titre && (
            <p className={cn("mb-1.5 flex items-center gap-1.5 font-semibold", vif && "mb-2 items-start gap-2 text-lg leading-snug tracking-tight")}>
              {vif ? <TriangleAlert className="mt-0.5 size-5 shrink-0" /> : <Sparkles className="size-3.5 shrink-0" />}
              <Riche texte={bloc.titre} />
            </p>
          )}
          {bloc.items.length === 1
            ? <p className={cn("font-medium", vif && "text-center font-bold text-lg tracking-tight")}><Riche texte={bloc.items[0]!} /></p>
            : (
              <ul className={cn("space-y-1", vif && "space-y-1.5")}>
                {bloc.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-50" />
                    <span><Riche texte={i} /></span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      );
    }
    case "frise":
      return (
        <ol className={cn("relative space-y-4 pl-1", anime)} style={style}>
          {bloc.items.map((etape, n) => (
            <li key={etape.titre} className="relative flex gap-3">
              {n < bloc.items.length - 1 && (
                <span aria-hidden className="absolute top-7 bottom-[-1rem] left-[0.8125rem] w-0.5 bg-primary/25" />
              )}
              <span
                aria-hidden
                className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs tabular-nums shadow-sm"
              >
                {n + 1}
              </span>
              <div className="min-w-0 space-y-0.5 pt-0.5">
                <p className="font-semibold text-[11px] text-primary uppercase tracking-wide">{etape.quand}</p>
                <p className="font-semibold text-sm">{etape.titre}</p>
                {etape.texte && (
                  <p className="text-muted-foreground text-sm leading-relaxed"><Riche texte={etape.texte} /></p>
                )}
              </div>
            </li>
          ))}
        </ol>
      );
    case "video":
      if (bloc.fichier) {
        return (
          <div className={cn("flex justify-center", anime)} style={style}>
            <video
              src={bloc.src}
              poster={bloc.image}
              title={bloc.titre}
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] max-h-[70vh] w-full max-w-xs rounded-xl border bg-black shadow-lifted"
            />
          </div>
        );
      }
      return (
        <div
          className={cn("aspect-video w-full overflow-hidden rounded-xl border bg-black shadow-lifted", anime)}
          style={style}
        >
          <iframe src={bloc.src} title={bloc.titre} allowFullScreen className="size-full" />
        </div>
      );
    case "lien":
      return (
        <p className={cn("text-sm leading-relaxed", anime)} style={style}>
          {bloc.avant && <span className="text-muted-foreground"><Riche texte={bloc.avant} /> </span>}
          <a
            href={bloc.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2 transition-opacity hover:opacity-70"
          >
            <BookOpen className="size-3.5" />
            {bloc.libelle}
          </a>
        </p>
      );
    case "regle":
      return (
        <div className={anime} style={style}>
          <RegleTexte regle={bloc.regle} />
        </div>
      );
    case "rejoindreSlack":
      return (
        <div className={anime} style={style}>
          <RejoindreSlack />
        </div>
      );
    case "identite":
      return null; // rendu par le parcours, qui tient l'état du formulaire
  }
}

/** « Join Slack » : recommandé, pas obligatoire (chantier du 28 oct.). Sans lien dans le réglage, rien. */
function RejoindreSlack() {
  const { slack } = useRegles();
  if (!slack) return null;
  return (
    <Button asChild>
      <a href={slack} target="_blank" rel="noreferrer">
        Join Slack
      </a>
    </Button>
  );
}

/**
 * Cohorte Ruul : prénom et nom tels que sur la pièce d'identité. Ruul les
 * exige pour ajouter le poster et les compare à sa vérification d'identité.
 * Modifier un champ après l'enregistrement reverrouille « Next » jusqu'au
 * prochain enregistrement. En aperçu admin, rien n'est écrit.
 */
function IdentiteRuul({
  initiale,
  simulation,
  onChange,
}: {
  initiale: { prenom: string; nom: string } | null;
  simulation: boolean;
  onChange: (enregistree: boolean) => void;
}) {
  const [prenom, setPrenom] = React.useState(initiale?.prenom ?? "");
  const [nom, setNom] = React.useState(initiale?.nom ?? "");
  const [etat, setEtat] = React.useState<"saisie" | "envoi" | "ok" | "erreur">(initiale ? "ok" : "saisie");
  const complet = prenom.trim() !== "" && nom.trim() !== "";

  const modifier = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    if (etat === "ok") onChange(false);
    setEtat("saisie");
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complet || etat === "envoi") return;
    setEtat("envoi");
    try {
      if (!simulation) await enregistrerIdentiteRuul(prenom, nom);
      setEtat("ok");
      onChange(true);
    } catch {
      setEtat("erreur");
    }
  };

  return (
    <form
      onSubmit={enregistrer}
      className="animate-in fade-in slide-in-from-bottom-2 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3 duration-500"
    >
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 font-semibold text-sm">
          <IdCard className="size-4 text-primary" />
          Your legal name
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Exactly as on your ID. We need it to add you in Ruul, and Ruul checks it against your identity check.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="identite-prenom">First name</Label>
          <Input id="identite-prenom" autoComplete="given-name" value={prenom} onChange={modifier(setPrenom)} maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="identite-nom">Last name</Label>
          <Input id="identite-nom" autoComplete="family-name" value={nom} onChange={modifier(setNom)} maxLength={80} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={!complet || etat === "envoi" || etat === "ok"}>
          {etat === "ok" ? <BadgeCheck /> : null}
          {etat === "ok" ? "Saved" : etat === "envoi" ? "Saving…" : "Save"}
        </Button>
        {etat === "erreur" && (
          <p className="text-destructive text-sm">Could not save. Please try again.</p>
        )}
      </div>
    </form>
  );
}

/** Les pastilles de progression : où on en est, d'un coup d'œil. */
function Pastilles({ etape }: { etape: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: NB_ETAPES }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-500",
            i < etape && "w-1.5 bg-primary/40",
            i === etape && "w-6 bg-primary",
            i > etape && "w-1.5 bg-muted",
          )}
        />
      ))}
    </div>
  );
}

function Quiz({
  questions,
  reponses,
  onRepondre,
  verdict,
}: {
  questions: Question[];
  reponses: Record<string, number | undefined>;
  onRepondre: (cle: string, index: number) => void;
  verdict: CorrectionQuiz | null;
}) {
  const ratees = new Set((verdict?.fausses ?? []).map((q) => q.cle));
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm leading-relaxed">
        {questions.length} quick questions, to be sure nothing important was missed. You need
        {" "}<strong className="font-semibold text-foreground">all of them right</strong>.
      </p>
      {questions.map((q, n) => (
        <fieldset
          key={q.cle}
          className="animate-in fade-in slide-in-from-bottom-2 space-y-2 fill-mode-backwards duration-500"
          style={{ animationDelay: `${n * DECALAGE_MS}ms` }}
        >
          <legend
            className={cn("font-medium text-sm", verdict && ratees.has(q.cle) && "text-destructive")}
          >
            {n + 1}. {q.question}
          </legend>
          {q.options.map((option, index) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-sm transition-all",
                reponses[q.cle] === index
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "hover:border-primary/40 hover:bg-muted/50",
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
 * Le parcours d'accueil d'un créateur slideshow : neuf écrans, puis un quiz.
 *
 * Il ne se ferme pas : ni croix, ni Échap, ni clic à côté. « Next » reste
 * verrouillé tant que l'écran n'a pas été déroulé jusqu'en bas ET que son
 * attente n'est pas purgée (`Ecran.attente`). Le bouton se remplit au fil de
 * l'attente et dit ce qui manque, sinon il passerait pour cassé. Le quiz final
 * est le vrai verrou : quatre questions, une faute renvoie à l'écran concerné.
 *
 * Mico commente : il salue, réfléchit, s'étonne sur l'écran qui compte, pleure
 * sur une mauvaise réponse et fait la fête à la fin.
 *
 * `simulation` : l'aperçu admin. Rien n'est écrit en base et la croix revient,
 * sinon on enfermerait l'admin dans l'accueil d'un créateur. `contexteSimule`
 * choisit l'accueil montré (standard, ou cohorte Ruul).
 */
export function OnboardingParcours({
  etapeInitiale = 0,
  simulation = false,
  contexteSimule = null,
  onTermine,
}: {
  etapeInitiale?: number;
  simulation?: boolean;
  contexteSimule?: ContexteAccueil | null;
  onTermine?: () => void;
}) {
  const [etape, setEtape] = React.useState(() => etapeDeReprise(etapeInitiale));
  const [ecoulees, setEcoulees] = React.useState(0);
  const [basAtteint, setBasAtteint] = React.useState(false);
  const [reponses, setReponses] = React.useState<Record<string, number | undefined>>({});
  const [verdict, setVerdict] = React.useState<CorrectionQuiz | null>(null);
  const [termine, setTermine] = React.useState(false);
  const corps = React.useRef<HTMLDivElement>(null);

  // Cohorte Ruul (posters venus du site) : écrans Slack et Payments à part.
  // L'aperçu admin montre l'accueil qu'on lui demande, pas celui de l'admin.
  const cohorte = useQuery({
    queryKey: ["accueil-cohorte"],
    queryFn: lireCohorteAccueil,
    enabled: !simulation,
    staleTime: Infinity,
  });
  // Les 5 étapes (28 oct., G) : le @ à créer et le lundi du 1er post.
  const comptes = useQuery({ queryKey: ["mes-comptes"], queryFn: mesComptes, enabled: !simulation });
  const semaine = useQuery({ queryKey: ["ma-premiere-semaine"], queryFn: lireMaPremiereSemaine, enabled: !simulation });
  const contexte = React.useMemo<ContexteAccueil | null | undefined>(() => {
    if (simulation) return contexteSimule;
    if (!cohorte.data || cohorte.data.cohorteRuul) return cohorte.data;
    const compte = comptePrincipal(comptes.data ?? []);
    const maintenant = new Date();
    const premier = premierPostLe({
      warmupEndsAt: compte?.warmup_ends_at ?? null,
      cohorteLundi: semaine.data?.cohorteLundi ?? null,
      maintenant,
      aujourdhui: partiesParis(maintenant).date,
    });
    return { ...cohorte.data, handle: compte?.handle_tiktok ?? null, premierPost: jourAnglais(premier) };
  }, [simulation, contexteSimule, cohorte.data, comptes.data, semaine.data]);
  const ecrans = ecransPour(contexte);
  const questions = questionsPour(contexte);

  const surQuiz = etape >= INDEX_QUIZ;
  const ecran = surQuiz ? null : ecrans[etape];
  const attente = ecran?.attente ?? 0;

  // Nom de la pièce d'identité (cohorte Ruul) : déjà connu, ou saisi ici.
  const [identiteSaisie, setIdentiteSaisie] = React.useState<boolean | null>(null);
  const identiteOk = identiteSaisie ?? Boolean(contexte?.identite);
  const demandeIdentite = ecran?.blocs.some((b) => b.type === "identite") ?? false;

  /**
   * Remesure, et n'ouvre jamais dans l'autre sens : une fois le bas atteint,
   * il le reste. Appelée souvent (montage, défilement, redimensionnement,
   * chaque seconde) parce qu'une mesure unique se prend pendant l'animation
   * d'entrée du dialogue, quand la hauteur vaut encore zéro — c'est ce qui
   * avait verrouillé l'écran 1 en production.
   */
  const verifierBas = React.useCallback(() => {
    const el = corps.current;
    if (el && basDePageAtteint(el)) setBasAtteint(true);
  }, []);

  React.useLayoutEffect(() => {
    setEcoulees(0);
    setBasAtteint(false);
    if (corps.current) corps.current.scrollTop = 0;
    const id = requestAnimationFrame(verifierBas);
    return () => cancelAnimationFrame(id);
  }, [etape, verifierBas]);

  // Le contenu arrive en retard (vidéo, polices, fin de l'animation) : on
  // réagit au redimensionnement plutôt que d'espérer.
  React.useEffect(() => {
    const el = corps.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(verifierBas);
    ro.observe(el);
    return () => ro.disconnect();
  }, [etape, verifierBas]);

  React.useEffect(() => {
    if (surQuiz) return;
    const id = setInterval(() => {
      setEcoulees((s) => s + 1);
      verifierBas(); // filet : l'état est rattrapé en une seconde quoi qu'il arrive
    }, 1000);
    return () => clearInterval(id);
  }, [surQuiz, verifierBas]);

  const allerA = (n: number) => {
    setEtape(n);
    if (!simulation) void enregistrerOnboardingEtape(n);
  };

  const reste = secondesRestantes(ecoulees, attente);
  const identiteManquante = demandeIdentite && !identiteOk;
  const ouvert = peutAvancer({ ecoulees, attente, basAtteint, identiteManquante });
  const remplissage = attente > 0 ? Math.min(100, (ecoulees / attente) * 100) : 100;

  const valider = () => {
    const resultat = corrigerQuiz(reponses, questions);
    setVerdict(resultat);
    if (!resultat.reussi) return;
    setTermine(true);
    if (!simulation) void marquerOnboardingVu();
  };

  const relire = () => {
    const cible = verdict?.ecranARelire ? indexEcran(verdict.ecranARelire) : -1;
    setVerdict(null);
    if (cible >= 0) setEtape(cible);
  };

  /** Mico suit l'écran, et le quiz le fait réagir. */
  const humeur: EtatMico = termine
    ? "celebrate"
    : surQuiz
    ? (verdict && verdict.complet && !verdict.reussi ? "sad" : "think")
    : (ecran?.mico ?? "idle");

  const titre = termine ? "You're all set!" : surQuiz ? "One last thing" : ecran?.titre;

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
        {/* Bandeau : Mico a sa petite scène à lui, pas un coin de marge. */}
        <div className="relative flex items-start gap-3 overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 pb-4 max-sm:rounded-none">
          <div
            key={humeur}
            className="w-20 shrink-0 animate-in zoom-in-50 duration-500 sm:w-24"
          >
            <Mico etat={humeur} />
          </div>
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            {simulation && (
              <span className="inline-block rounded-md bg-warning/20 px-2 py-0.5 font-medium text-warning-foreground text-xs">
                Preview, nothing is saved
              </span>
            )}
            <h2 key={titre} className="animate-in fade-in slide-in-from-right-2 font-semibold text-base tracking-tight duration-400">
              {titre}
            </h2>
            <div className="flex items-center gap-2">
              <Pastilles etape={Math.min(etape, NB_ETAPES - 1)} />
              <span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
                {Math.min(etape + 1, NB_ETAPES)} / {NB_ETAPES}
              </span>
            </div>
          </div>
        </div>

        <div ref={corps} onScroll={verifierBas} className="max-h-[52vh] overflow-y-auto px-6 py-1">
          {termine
            ? (
              <div className="animate-in fade-in zoom-in-95 space-y-2 py-4 text-center duration-500">
                <p className="font-semibold text-lg">Welcome to the team!</p>
                <p className="text-muted-foreground text-sm">
                  You know everything you need to post your first slideshow. See you on Slack.
                </p>
              </div>
            )
            : (
              <div key={etape} className="space-y-3">
                {surQuiz
                  ? (
                    <Quiz
                      questions={questions}
                      reponses={reponses}
                      onRepondre={(cle, i) => {
                        setReponses((r) => ({ ...r, [cle]: i }));
                        setVerdict(null);
                      }}
                      verdict={verdict}
                    />
                  )
                  : ecran?.blocs.map((bloc, i) =>
                    bloc.type === "identite"
                      ? (
                        <IdentiteRuul
                          key={`${ecran.cle}-${i}`}
                          initiale={contexte?.identite ?? null}
                          simulation={simulation}
                          onChange={setIdentiteSaisie}
                        />
                      )
                      : <BlocVue key={`${ecran.cle}-${i}`} bloc={bloc} rang={i} />
                  )}

                {surQuiz && verdict && !verdict.complet && (
                  <p className="animate-in fade-in text-destructive text-sm">
                    Please answer every question.
                  </p>
                )}
                {surQuiz && verdict?.complet && !verdict.reussi && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 space-y-2 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm duration-300">
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
            )}
        </div>

        <div className="flex items-center gap-2 border-t p-4 sm:p-6">
          {etape > 0 && !termine && (
            <Button variant="ghost" onClick={() => setEtape(etape - 1)}>
              <ArrowLeft />
              Back
            </Button>
          )}
          <div className="ml-auto">
            {termine
              ? (
                <Button onClick={() => onTermine?.()} className="animate-in zoom-in-95 duration-300">
                  <PartyPopper />
                  Let's go!
                </Button>
              )
              : surQuiz
              ? (
                <Button onClick={valider}>
                  <Sparkles />
                  Check my answers
                </Button>
              )
              : (
                <Button
                  onClick={() => allerA(etape + 1)}
                  disabled={!ouvert}
                  className={cn("relative overflow-hidden", ouvert && "animate-fade-in")}
                >
                  {/* Le remplissage dit combien d'attente il reste, sans chiffre à lire. */}
                  {!ouvert && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-foreground/10 transition-[width] duration-1000 ease-linear"
                      style={{ width: `${remplissage}%` }}
                    />
                  )}
                  <span className="relative inline-flex items-center gap-2">
                    {ouvert ? <ArrowRight /> : <Lock />}
                    {!basAtteint
                      ? "Scroll to the bottom"
                      : reste > 0
                      ? `Next (${reste}s)`
                      : identiteManquante
                      ? "Save your legal name"
                      : "Next"}
                  </span>
                </Button>
              )}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
