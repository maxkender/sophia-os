import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRegles } from "@/features/regles/api";
import { RegleTexte } from "@/features/regles/CartesRegles";
import { cn } from "@/lib/utils";

import {
  CINQ_ETAPES,
  dimancheAvant,
  etatsCinqEtapes,
  followsBloques,
  heurePremierPost,
  jourAnglais,
  premierPostLe,
  premiereSemaineFinie,
  guideTermine,
  type CleEtape,
  type EtatCinq,
} from "./cinqEtapes";
import { ChangerHandle } from "./ChangerHandle";
import { BoutonDeclarer } from "./BoutonDeclarer";
import {
  lireMaPremiereSemaine,
  lireMesDeclarations,
  lireMesTextesDebut,
  lireMonWarmup,
  type EtapeDeclarable,
} from "./cinqEtapesApi";
import { formaterJour, partiesParis } from "./datesRuul";

function Pastille({ numero, etat }: { numero: number; etat: EtatCinq }) {
  return (
    <span
      className={cn(
        "relative flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-xs",
        etat === "fait" && "bg-success text-success-foreground",
        etat === "en_cours" && "bg-primary text-primary-foreground ring-4 ring-primary/20",
        (etat === "a_venir" || etat === "recommande") && "border bg-background text-muted-foreground",
      )}
    >
      {etat === "fait" ? <Check className="size-3.5" /> : numero}
    </span>
  );
}

/** Le conseil « TikTok limite les follows » (0498), modifiable dans Settings. */
export const CONSEIL_FOLLOWS_DEFAUT =
  "TikTok sometimes limits new accounts. Fill in your profile (photo, name, birthday), verify your phone in TikTok settings, watch videos on the For You page for 10–15 minutes, then follow accounts one by one (not too fast). If it still doesn't work, wait a few hours and try again, then tell us in #questions.";

/**
 * La première semaine en 5 étapes, sur l'accueil du posteur (chantier du
 * 28 oct., partie G) : Log in · Join Slack (recommandé) · TikTok @handle ·
 * Start warmup + 5 follows avant dimanche minuit · 1er post le lundi, avec la
 * règle du lien. Pas pour la cohorte Ruul (exclue), qui garde sa frise.
 * S'efface une fois la 1re semaine de posts finie.
 */
export function CinqEtapes({
  handle,
  compteId = null,
  warmupStartedAt,
  warmupEndsAt,
  maintenant = new Date(),
}: {
  handle: string | null;
  compteId?: string | null;
  warmupStartedAt: string | null;
  warmupEndsAt: string | null;
  maintenant?: Date;
}) {
  const { t, i18n } = useTranslation();
  const { slack } = useRegles();
  const profil = useQuery({ queryKey: ["ma-premiere-semaine"], queryFn: lireMaPremiereSemaine });
  const monWarmup = useQuery({ queryKey: ["mon-warmup"], queryFn: lireMonWarmup, refetchInterval: 10 * 60_000 });
  const declarations = useQuery({ queryKey: ["mes-declarations"], queryFn: lireMesDeclarations });
  const textes = useQuery({ queryKey: ["mes-textes-debut"], queryFn: lireMesTextesDebut, staleTime: 60 * 60_000 });
  if (!profil.data) return null;
  const aujourdhui = partiesParis(maintenant).date;
  const premierPost = premierPostLe({
    warmupEndsAt,
    cohorteLundi: profil.data.cohorteLundi,
    maintenant,
    aujourdhui,
  });
  if (premiereSemaineFinie(premierPost, aujourdhui)) return null;
  // 0544 : 24 h après le 1er post publié avec lien, le guide disparaît.
  if (guideTermine(profil.data.premierPostLienAt, maintenant)) return null;
  // Refusée par l'équipe : la déclaration ne compte plus.
  const actives = (declarations.data ?? []).filter((d) => d.statut !== "refuse");
  const declares = new Set(actives.map((d) => d.etape));
  const aVerifier = new Set(actives.filter((d) => d.statut === "en_attente").map((d) => d.etape));
  const etats = etatsCinqEtapes({
    slackLie: profil.data.slackLie,
    warmupStartedAt,
    premierPost,
    aujourdhui,
    pret: monWarmup.data?.pret ?? false,
    declares,
    premierPostLienAt: profil.data.premierPostLienAt,
  });
  // Déclarée seulement (l'OS ne la voit pas encore) : « we'll check ».
  const enVerification = (cle: CleEtape) =>
    aVerifier.has(cle as EtapeDeclarable) && !(cle === "slack" && profil.data?.slackLie) && !(cle === "warmup" && monWarmup.data?.pret);
  const arrivee = heurePremierPost(premierPost, monWarmup.data?.pays);
  const bloque = followsBloques(monWarmup.data, maintenant);
  const conseilFollows = textes.data?.debut_popup_follows_bloque?.trim() || CONSEIL_FOLLOWS_DEFAUT;
  const jour = (d: string) => formaterJour(d, i18n.language);
  const arobase = handle ? `@${handle.replace(/^@/, "")}` : null;

  const contenu: Record<CleEtape, { titre: string; detail?: React.ReactNode }> = {
    connexion: { titre: t("calendrier.cinq.connexion") },
    slack: {
      titre: t("calendrier.cinq.slack"),
      detail: (
        <>
          <p>{t("calendrier.cinq.slackPasVu")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {slack && (
              <Button asChild size="sm" variant="outline" className="mt-1 h-7">
                <a href={slack} target="_blank" rel="noreferrer">
                  {t("calendrier.cinq.rejoindreSlack")}
                </a>
              </Button>
            )}
            <BoutonDeclarer etape="slack" libelle={t("calendrier.cinq.declarer.slack")} />
          </div>
        </>
      ),
    },
    tiktok: {
      titre: arobase ? t("calendrier.cinq.tiktok", { handle: arobase }) : t("calendrier.cinq.tiktokSansHandle"),
      detail: (
        <>
          <p>{t("calendrier.cinq.tiktokDetail")}</p>
          {/* Le @ donné est déjà pris : la recrue donne celui qu'elle a créé (lu sur TikTok avant d'être gardé). */}
          {compteId && <ChangerHandle compteId={compteId} />}
          <BoutonDeclarer etape="tiktok" libelle={t("calendrier.cinq.declarer.fait")} />
        </>
      ),
    },
    warmup: {
      titre: t("calendrier.cinq.warmup", { dimanche: jour(dimancheAvant(premierPost)) }),
      detail: (
        <>
          {/* 0 follow plus de 24 h après Start warmup : TikTok limite souvent les comptes neufs. */}
          {bloque && (
            <p className="mt-1 rounded-md border border-warning/50 bg-warning/10 p-2 text-foreground" data-testid="follows-bloques">
              {conseilFollows}
            </p>
          )}
          <RegleTexte regle="warmup" className="mt-1 p-2 text-xs" />
          {warmupStartedAt && <BoutonDeclarer etape="warmup" libelle={t("calendrier.cinq.declarer.fait")} />}
        </>
      ),
    },
    post: {
      titre: t("calendrier.cinq.post", { lundi: jour(premierPost) }),
      detail: (
        <>
          {/* Les dates aux posteurs sont en anglais ; l'heure dans leur fuseau (JST au Japon). */}
          <p className="font-medium text-foreground" data-testid="heure-premier-post">
            {arrivee.fuseau
              ? t("calendrier.cinq.disponible", { jour: jourAnglais(premierPost), heure: arrivee.heure, fuseau: arrivee.fuseau })
              : t("calendrier.cinq.disponibleLocal", { jour: jourAnglais(premierPost), heure: arrivee.heure })}
          </p>
          <RegleTexte regle="lien" className="mt-1 p-2 text-xs" />
        </>
      ),
    },
  };

  return (
    <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="cinq-etapes">
      <h2 className="font-semibold text-base tracking-tight">{t("calendrier.cinq.titre")}</h2>
      <ol>
        {CINQ_ETAPES.map((cle, i) => (
          <li key={cle} className="relative flex gap-3 pb-4 last:pb-0" data-etape={cle} data-etat={etats[cle]}>
            {i < CINQ_ETAPES.length - 1 && <span aria-hidden className="absolute top-7 bottom-0 left-3 w-px bg-border" />}
            <Pastille numero={i + 1} etat={etats[cle]} />
            <div className={cn("min-w-0 space-y-0.5 text-sm", etats[cle] === "fait" && "opacity-60")}>
              <p className="font-semibold leading-6">
                {contenu[cle].titre}
                {etats[cle] === "recommande" && (
                  <span className="ml-2 font-normal text-muted-foreground text-xs">{t("calendrier.cinq.recommande")}</span>
                )}
                {cle === "slack" && profil.data.slackLie && (
                  <span className="ml-2 font-normal text-success text-xs" data-testid="slack-relie">{t("calendrier.cinq.slackRelie")}</span>
                )}
                {etats[cle] === "fait" && enVerification(cle) && (
                  <span className="ml-2 font-normal text-muted-foreground text-xs" data-testid={`verification-${cle}`}>
                    {t("calendrier.cinq.declarer.enVerification")}
                  </span>
                )}
              </p>
              {etats[cle] !== "fait" && contenu[cle].detail && (
                <div className="text-muted-foreground text-xs leading-relaxed">{contenu[cle].detail}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {/* Bon à savoir : absent, arrêter, poser une question. */}
      <div className="space-y-1 border-t pt-3 text-sm" data-testid="bon-a-savoir">
        <p className="font-semibold">{t("calendrier.cinq.bonASavoir.titre")}</p>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>• {t("calendrier.cinq.bonASavoir.absent")}</li>
          <li>• {t("calendrier.cinq.bonASavoir.arreter")}</li>
          <li>• {t("calendrier.cinq.bonASavoir.questions")}</li>
        </ul>
      </div>
    </section>
  );
}
