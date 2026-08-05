import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  genererPersona,
  listerLanguesReference,
  listerMedias,
  majCompte,
  majUpwork,
  supprimerCompte,
} from "@/features/moteur/api";
import { listerUgcPersonas } from "@/features/ugc/api";
import { nomLangue } from "@/features/moteur/langues";
import type { CompteAvecDetails } from "@/features/moteur/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const rafraichirComptes = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["comptes"] });
  qc.invalidateQueries({ queryKey: ["posters"] });
};

/**
 * Sélecteur d'avatar. Les visuels portant un visage identifiable sont exclus :
 * le compte est public et la personne photographiée n'a rien demandé.
 */
function ChoixAvatar({ compte }: { compte: CompteAvecDetails }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);

  const medias = useQuery({
    queryKey: ["medias", compte.compte_reference_id],
    queryFn: () => listerMedias(compte.compte_reference_id ?? undefined),
    enabled: ouvert,
  });

  const choisir = useMutation({
    mutationFn: (url: string) =>
      majCompte(compte.id, { avatar_url: url, avatar_source: "bibliotheque" }),
    onSuccess: () => {
      setOuvert(false);
      rafraichirComptes(queryClient);
    },
  });

  const utilisables = (medias.data ?? []).filter((m) => m.visage_identifiable === false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {compte.avatar_url ? (
          <img src={compte.avatar_url} alt="" className="size-10 rounded-full border object-cover" />
        ) : (
          <div className="size-10 rounded-full border bg-muted" />
        )}
        <Button size="sm" variant="outline" onClick={() => setOuvert((o) => !o)}>
          {t("comptes.choisirAvatar")}
        </Button>
      </div>

      {ouvert && (
        <div className="rounded-lg border p-3">
          {medias.isPending && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {medias.data && utilisables.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("comptes.avatarAucun")}</p>
          )}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {utilisables.map((media) => (
              <button
                key={media.id}
                type="button"
                onClick={() => choisir.mutate(media.url)}
                className="overflow-hidden rounded-md border transition-opacity hover:opacity-80"
              >
                <img src={media.url} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Génère une identité (pseudos, bio, avatar) à partir de la seule niche. Les
 * pseudos évoquant le compte de référence sont écartés côté serveur, et
 * l'avatar ne peut venir que d'un visuel sans visage identifiable.
 */
function GenerationPersona({ compte }: { compte: CompteAvecDetails }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const proposition = useMutation({ mutationFn: () => genererPersona(compte.id) });
  const appliquer = useMutation({
    mutationFn: () => genererPersona(compte.id, true),
    onSuccess: () => rafraichirComptes(queryClient),
  });

  const enCours = proposition.isPending || appliquer.isPending;
  const resultat = proposition.data;

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={enCours} onClick={() => proposition.mutate()}>
          {proposition.isPending ? t("comptes.generation") : t("comptes.genererPersona")}
        </Button>
        {resultat && resultat.pseudos.length > 0 && (
          <Button size="sm" disabled={enCours} onClick={() => appliquer.mutate()}>
            {appliquer.isPending ? t("common.saving") : t("comptes.appliquer")}
          </Button>
        )}
      </div>

      {resultat && resultat.pseudos.length === 0 && (
        <p className="text-sm text-warning">{t("comptes.personaVide")}</p>
      )}

      {resultat && resultat.pseudos.length > 0 && (
        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t("comptes.pseudosProposes")}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {resultat.pseudos.map((pseudo) => (
                <Badge key={pseudo} variant="secondary">
                  @{pseudo}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("comptes.bioProposee")}</p>
            <p className="whitespace-pre-wrap pt-1">{resultat.bio}</p>
          </div>
          {resultat.avatarUrl && (
            <img src={resultat.avatarUrl} alt="" className="size-16 rounded-full border object-cover" />
          )}
        </div>
      )}

      {(proposition.isError || appliquer.isError) && (
        <p className="text-sm text-destructive">
          {((proposition.error ?? appliquer.error) as Error).message}
        </p>
      )}
    </div>
  );
}

/** Checkmark UGC AI (slideshow) ou UGC AI VIDEO + persona unique associé. */
function UgcAiCompte({ compte }: { compte: CompteAvecDetails }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const personas = useQuery({
    queryKey: ["ugc-personas"],
    queryFn: async () => (await listerUgcPersonas()).personas,
    staleTime: 30_000,
  });

  const maj = useMutation({
    mutationFn: (patch: {
      ugc_ai?: boolean;
      ugc_ai_video?: boolean;
      ugc_persona_id?: string | null;
    }) => majCompte(compte.id, patch),
    onSuccess: () => rafraichirComptes(queryClient),
  });

  const ugcVideo = Boolean(compte.ugc_ai_video);
  const ugc = Boolean(compte.ugc_ai) && !ugcVideo;
  const personaId = compte.ugc_persona_id ?? "";

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {ugcVideo ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{t("comptes.ugcAiVideo")}</p>
              <p className="text-xs text-muted-foreground">{t("comptes.ugcAiVideoAide")}</p>
            </div>
            <Badge>{t("comptes.ugcAiVideoBadge")}</Badge>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`persona-${compte.id}`}>{t("comptes.ugcPersona")}</Label>
            <select
              id={`persona-${compte.id}`}
              className={selectClass}
              value={personaId}
              disabled={maj.isPending || personas.isPending}
              onChange={(e) =>
                maj.mutate({ ugc_persona_id: e.target.value || null })
              }
            >
              <option value="">{t("comptes.ugcPersonaChoisir")}</option>
              {(personas.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
            {!personaId && (
              <p className="text-xs text-destructive">{t("comptes.ugcPersonaRequis")}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{t("comptes.ugcAi")}</p>
              <p className="text-xs text-muted-foreground">{t("comptes.ugcAiAide")}</p>
            </div>
            <button
              type="button"
              disabled={maj.isPending}
              onClick={() =>
                maj.mutate({
                  ugc_ai: !ugc,
                  ugc_ai_video: false,
                  ugc_persona_id: !ugc ? compte.ugc_persona_id : null,
                })
              }
              className={
                ugc
                  ? "rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-md border px-3 py-1 text-xs"
              }
            >
              {ugc ? "UGC ✓" : "UGC"}
            </button>
          </div>
          {ugc && (
            <div className="space-y-1.5">
              <Label htmlFor={`persona-${compte.id}`}>{t("comptes.ugcPersona")}</Label>
              <select
                id={`persona-${compte.id}`}
                className={selectClass}
                value={personaId}
                disabled={maj.isPending || personas.isPending}
                onChange={(e) =>
                  maj.mutate({ ugc_persona_id: e.target.value || null })
                }
              >
                <option value="">{t("comptes.ugcPersonaChoisir")}</option>
                {(personas.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
              {!personaId && (
                <p className="text-xs text-destructive">{t("comptes.ugcPersonaRequis")}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Quota d'assignation du jour (1–3). Enregistré dès le clic. */
export function PostsParJourCompte({ compte }: { compte: CompteAvecDetails }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const valeur = Math.min(3, Math.max(1, Number(compte.posts_par_jour) || 1));

  const maj = useMutation({
    mutationFn: (n: number) => majCompte(compte.id, { posts_par_jour: n }),
    onSuccess: () => rafraichirComptes(queryClient),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label className="text-xs text-muted-foreground">{t("reglages.postsParJour")}</Label>
      <div className="inline-flex rounded-md border p-0.5">
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            disabled={maj.isPending}
            onClick={() => maj.mutate(n)}
            className={
              valeur === n
                ? "rounded px-2.5 py-1 text-xs font-medium bg-primary text-primary-foreground"
                : "rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            }
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Répartition recycle / remanié / nouveau propre au compte.
 * Tant qu'elle est vide, le compte suit les réglages globaux.
 */
function ReglagesCompte({ compte }: { compte: CompteAvecDetails }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const surcharge = compte.repartition !== null;

  const [repartition, setRepartition] = React.useState(
    compte.repartition ?? { recycle: 60, remanie: 20, nouveau: 20 },
  );

  const rafraichir = () => rafraichirComptes(queryClient);
  const enregistrer = useMutation({
    mutationFn: () => majCompte(compte.id, { repartition }),
    onSuccess: rafraichir,
  });
  const reinitialiser = useMutation({
    mutationFn: () => majCompte(compte.id, { repartition: null }),
    onSuccess: rafraichir,
  });

  const total = repartition.recycle + repartition.remanie + repartition.nouveau;
  const totalValide = total === 100;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("comptes.reglagesPropres")}</p>
        <Badge variant={surcharge ? "default" : "outline"}>
          {surcharge ? t("comptes.surcharge") : t("comptes.suitGlobal")}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(["recycle", "remanie", "nouveau"] as const).map((cle) => (
          <div key={cle} className="space-y-1">
            <Label htmlFor={`${cle}-${compte.id}`} className="text-xs">
              {t(`reglages.${cle}`)}
            </Label>
            <Input
              id={`${cle}-${compte.id}`}
              type="number"
              min={0}
              value={repartition[cle]}
              onChange={(e) => setRepartition({ ...repartition, [cle]: Number(e.target.value) })}
            />
          </div>
        ))}
      </div>

      {!totalValide && <p className="text-xs text-destructive">{t("reglages.totalInvalide")}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!totalValide || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {enregistrer.isPending ? t("common.saving") : t("comptes.activerSurcharge")}
        </Button>
        {surcharge && (
          <Button size="sm" variant="outline" onClick={() => reinitialiser.mutate()}>
            {t("comptes.retirerSurcharge")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("comptes.reglagesHint")}</p>
    </div>
  );
}

/** Infos du compte : nom affiché, @ TikTok, langue, lien Upwork. */
function InfosCompte({ compte }: { compte: CompteAvecDetails }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });

  const [nom, setNom] = React.useState(compte.persona_nom ?? "");
  const [handle, setHandle] = React.useState(compte.handle_tiktok ?? "");
  const [langue, setLangue] = React.useState(compte.langue);
  const [upwork, setUpwork] = React.useState(compte.profiles?.upwork_url ?? "");

  const upworkInitial = compte.profiles?.upwork_url ?? "";
  const modifie =
    nom !== (compte.persona_nom ?? "") ||
    handle !== (compte.handle_tiktok ?? "") ||
    langue !== compte.langue ||
    upwork !== upworkInitial;

  const enregistrer = useMutation({
    mutationFn: async () => {
      await majCompte(compte.id, {
        persona_nom: nom.trim() || null,
        handle_tiktok: handle.trim().replace(/^@/, "") || null,
        langue,
      });
      if (upwork !== upworkInitial) await majUpwork(compte.poster_id, upwork);
    },
    onSuccess: () => rafraichirComptes(queryClient),
  });

  const opts = langues.data ?? [];
  const languesOpts = opts.includes(langue) ? opts : [langue, ...opts];

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`nom-${compte.id}`}>{t("comptes.nomAffiche")}</Label>
        <Input id={`nom-${compte.id}`} value={nom} onChange={(e) => setNom(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`handle-${compte.id}`}>{t("comptes.pseudo")}</Label>
        <Input
          id={`handle-${compte.id}`}
          value={handle}
          placeholder="pseudo.tiktok"
          onChange={(e) => setHandle(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`langue-${compte.id}`}>{t("comptes.langue")}</Label>
        <select
          id={`langue-${compte.id}`}
          className={selectClass}
          value={langue}
          onChange={(e) => setLangue(e.target.value)}
        >
          {languesOpts.map((l) => (
            <option key={l} value={l}>
              {nomLangue(l)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`upwork-${compte.id}`}>{t("comptes.upwork")}</Label>
        <Input
          id={`upwork-${compte.id}`}
          value={upwork}
          placeholder="https://www.upwork.com/…"
          onChange={(e) => setUpwork(e.target.value)}
        />
      </div>
      {modifie && (
        <div className="sm:col-span-2">
          <Button size="sm" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
            {enregistrer.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Éditeur complet d'un compte de publication (identité, avatar, réglages). */
export function CompteEditor({ compte }: { compte: CompteAvecDetails }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const retirer = useMutation({
    mutationFn: () => supprimerCompte(compte.id),
    onSuccess: () => rafraichirComptes(queryClient),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (window.confirm(t("comptes.confirmDelete"))) retirer.mutate();
          }}
        >
          {t("comptes.supprimerCompte")}
        </Button>
      </div>

      <div className="rounded-lg border p-3">
        <PostsParJourCompte compte={compte} />
        <p className="mt-1.5 text-xs text-muted-foreground">{t("comptes.postsParJourHint")}</p>
      </div>
      <UgcAiCompte compte={compte} />
      <InfosCompte compte={compte} />
      <ChoixAvatar compte={compte} />
      <GenerationPersona compte={compte} />
      <ReglagesCompte compte={compte} />
    </div>
  );
}
