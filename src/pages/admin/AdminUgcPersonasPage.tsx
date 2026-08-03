import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Loader2, RefreshCw, Save, Sparkles, Trash2, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  genererUgcAngle,
  genererUgcAngles,
  genererUgcFace,
  genererUgcProfile,
  listerAffectationsPersonasUgc,
  listerUgcPersonas,
  sauverUgcPersona,
  supprimerUgcPersona,
  ugcPersonaDefaults,
  type AffectationPersonaUgc,
  type UgcAngle,
} from "@/features/ugc/api";
import type { UgcPersona } from "@/features/ugc/types";

type Etape = "prompt" | "face" | "angles" | "profile" | "save";

const ANGLES: UgcAngle[] = ["left", "right", "down"];

export function AdminUgcPersonasPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const defaults = useQuery({
    queryKey: ["ugc-persona-defaults"],
    queryFn: ugcPersonaDefaults,
    staleTime: 60_000,
  });
  const liste = useQuery({
    queryKey: ["ugc-personas"],
    queryFn: async () => (await listerUgcPersonas()).personas,
  });
  const affectations = useQuery({
    queryKey: ["ugc-persona-comptes"],
    queryFn: listerAffectationsPersonasUgc,
    staleTime: 30_000,
  });
  const comptesParPersona = React.useMemo(() => {
    const m = new Map<string, AffectationPersonaUgc[]>();
    for (const a of affectations.data ?? []) {
      const list = m.get(a.personaId) ?? [];
      list.push(a);
      m.set(a.personaId, list);
    }
    return m;
  }, [affectations.data]);

  const [etape, setEtape] = React.useState<Etape>("prompt");
  const [promptFace, setPromptFace] = React.useState("");
  const [promptLeft, setPromptLeft] = React.useState("");
  const [promptRight, setPromptRight] = React.useState("");
  const [promptDown, setPromptDown] = React.useState("");
  const [promptProfile, setPromptProfile] = React.useState("");
  const [faceUrl, setFaceUrl] = React.useState<string | null>(null);
  const [draftId, setDraftId] = React.useState<string | null>(null);
  const [leftUrl, setLeftUrl] = React.useState<string | null>(null);
  const [rightUrl, setRightUrl] = React.useState<string | null>(null);
  const [downUrl, setDownUrl] = React.useState<string | null>(null);
  const [profileUrl, setProfileUrl] = React.useState<string | null>(null);
  const [nom, setNom] = React.useState("");
  const [progress, setProgress] = React.useState<string | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [angleEnCours, setAngleEnCours] = React.useState<UgcAngle | null>(null);
  const [listeAngleBusy, setListeAngleBusy] = React.useState<string | null>(null);
  const [listeProfilBusy, setListeProfilBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!defaults.data) return;
    setPromptFace((p) => p || defaults.data.promptFace);
    setPromptLeft((p) => p || defaults.data.promptLeft);
    setPromptRight((p) => p || defaults.data.promptRight);
    setPromptDown((p) => p || defaults.data.promptDown);
    setPromptProfile((p) => p || defaults.data.promptProfile);
  }, [defaults.data]);

  function promptPourAngle(angle: UgcAngle): string {
    if (angle === "left") return promptLeft;
    if (angle === "right") return promptRight;
    return promptDown;
  }

  function setUrlPourAngle(angle: UgcAngle, url: string) {
    if (angle === "left") setLeftUrl(url);
    else if (angle === "right") setRightUrl(url);
    else setDownUrl(url);
  }

  function labelAngle(angle: UgcAngle): string {
    return t(`ugc.personas.${angle}`);
  }

  function resetCreation() {
    setEtape("prompt");
    setFaceUrl(null);
    setDraftId(null);
    setLeftUrl(null);
    setRightUrl(null);
    setDownUrl(null);
    setProfileUrl(null);
    setNom("");
    setProgress(null);
    setErreur(null);
    setAngleEnCours(null);
    if (defaults.data) {
      setPromptFace(defaults.data.promptFace);
      setPromptLeft(defaults.data.promptLeft);
      setPromptRight(defaults.data.promptRight);
      setPromptDown(defaults.data.promptDown);
      setPromptProfile(defaults.data.promptProfile);
    }
  }

  const genererFace = useMutation({
    mutationFn: () => genererUgcFace(promptFace, setProgress),
    onMutate: () => {
      setErreur(null);
      setProgress(t("ugc.personas.enCoursFace"));
    },
    onSuccess: (r) => {
      setFaceUrl(r.imageUrl);
      setDraftId(r.draftId);
      setLeftUrl(null);
      setRightUrl(null);
      setDownUrl(null);
      setProfileUrl(null);
      setEtape("face");
      setProgress(null);
    },
    onError: (e) => {
      setProgress(null);
      setErreur((e as Error).message);
    },
  });

  const genererAngles = useMutation({
    mutationFn: () => {
      if (!faceUrl || !draftId) throw new Error("Face manquante");
      return genererUgcAngles(
        {
          faceUrl,
          draftId,
          promptLeft,
          promptRight,
          promptDown,
        },
        setProgress,
      );
    },
    onMutate: () => {
      setErreur(null);
      setProgress(t("ugc.personas.enCoursAngles"));
    },
    onSuccess: (r) => {
      setLeftUrl(r.leftUrl);
      setRightUrl(r.rightUrl);
      setDownUrl(r.downUrl);
      setProfileUrl(null);
      setEtape("profile");
      setProgress(null);
    },
    onError: (e) => {
      setProgress(null);
      setErreur((e as Error).message);
    },
  });

  const regenererAngleDraft = useMutation({
    mutationFn: (angle: UgcAngle) => {
      if (!faceUrl || !draftId) throw new Error("Face manquante");
      return genererUgcAngle(
        {
          angle,
          faceUrl,
          draftId,
          prompt: promptPourAngle(angle),
        },
        setProgress,
      );
    },
    onMutate: (angle) => {
      setErreur(null);
      setAngleEnCours(angle);
      setProgress(
        t("ugc.personas.enCoursAngle", { angle: labelAngle(angle) }),
      );
    },
    onSuccess: (r) => {
      setUrlPourAngle(r.angle, r.imageUrl);
      setProfileUrl(null);
      setAngleEnCours(null);
      setProgress(null);
      if (etape === "save") setEtape("profile");
    },
    onError: (e) => {
      setAngleEnCours(null);
      setProgress(null);
      setErreur((e as Error).message);
    },
  });

  const genererProfil = useMutation({
    mutationFn: () => {
      if (!faceUrl || !leftUrl || !rightUrl || !downUrl || !draftId) {
        throw new Error(t("ugc.personas.imagesManquantes"));
      }
      return genererUgcProfile(
        {
          faceUrl,
          leftUrl,
          rightUrl,
          downUrl,
          draftId,
          prompt: promptProfile,
        },
        setProgress,
      );
    },
    onMutate: () => {
      setErreur(null);
      setProgress(t("ugc.personas.enCoursProfil"));
    },
    onSuccess: (r) => {
      setProfileUrl(r.imageUrl);
      if (r.prompt) setPromptProfile(r.prompt);
      setEtape("save");
      setProgress(null);
    },
    onError: (e) => {
      setProgress(null);
      setErreur((e as Error).message);
    },
  });

  const sauver = useMutation({
    mutationFn: () => {
      if (!faceUrl || !leftUrl || !rightUrl || !downUrl || !profileUrl) {
        throw new Error(t("ugc.personas.imagesManquantes"));
      }
      return sauverUgcPersona({
        nom,
        promptBase: promptFace,
        faceUrl,
        leftUrl,
        rightUrl,
        downUrl,
        profileUrl,
        draftId: draftId ?? undefined,
        promptLeft,
        promptRight,
        promptDown,
        promptProfile,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ugc-personas"] });
      void queryClient.invalidateQueries({ queryKey: ["ugc-persona-comptes"] });
      resetCreation();
    },
    onError: (e) => setErreur((e as Error).message),
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerUgcPersona(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ugc-personas"] });
      void queryClient.invalidateQueries({ queryKey: ["ugc-persona-comptes"] });
    },
  });

  async function regenererAnglePersona(persona: UgcPersona, angle: UgcAngle) {
    const key = `${persona.id}:${angle}`;
    if (listeAngleBusy || listeProfilBusy) return;
    setListeAngleBusy(key);
    setErreur(null);
    try {
      const prompt =
        angle === "left"
          ? persona.prompt_left
          : angle === "right"
            ? persona.prompt_right
            : persona.prompt_down;
      await genererUgcAngle(
        {
          angle,
          personaId: persona.id,
          faceUrl: persona.image_face_url,
          prompt: prompt ?? undefined,
        },
        (detail) => setProgress(detail),
      );
      void queryClient.invalidateQueries({ queryKey: ["ugc-personas"] });
      setProgress(t("ugc.personas.angleRefait", { angle: labelAngle(angle) }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setProgress(null);
    } finally {
      setListeAngleBusy(null);
    }
  }

  async function regenererProfilPersona(persona: UgcPersona) {
    if (listeAngleBusy || listeProfilBusy) return;
    setListeProfilBusy(persona.id);
    setErreur(null);
    try {
      await genererUgcProfile(
        {
          personaId: persona.id,
          prompt: persona.prompt_profile ?? defaults.data?.promptProfile,
        },
        (detail) => setProgress(detail),
      );
      void queryClient.invalidateQueries({ queryKey: ["ugc-personas"] });
      setProgress(t("ugc.personas.profilRefait"));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setProgress(null);
    } finally {
      setListeProfilBusy(null);
    }
  }

  const busy =
    genererFace.isPending ||
    genererAngles.isPending ||
    regenererAngleDraft.isPending ||
    genererProfil.isPending ||
    sauver.isPending;

  const urlParAngle = {
    left: leftUrl,
    right: rightUrl,
    down: downUrl,
  } as const;

  const anglesPrets = Boolean(leftUrl && rightUrl && downUrl);
  const showProfileStep =
    anglesPrets && (etape === "profile" || etape === "save");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("ugc.personas.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("ugc.personas.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" />
            {t("ugc.personas.creerTitre")}
          </CardTitle>
          <CardDescription>{t("ugc.personas.creerDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Étape 1 — prompt face */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="promptFace">{t("ugc.personas.promptFace")}</Label>
              <Badge variant="outline">1 · face</Badge>
            </div>
            <textarea
              id="promptFace"
              className="min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={promptFace}
              onChange={(e) => setPromptFace(e.target.value)}
              disabled={busy}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || !promptFace.trim()}
                onClick={() => genererFace.mutate()}
              >
                {genererFace.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {faceUrl ? t("ugc.personas.regenerer") : t("ugc.personas.generer")}
              </Button>
              {faceUrl && etape === "face" && (
                <Button
                  type="button"
                  variant="default"
                  disabled={busy}
                  onClick={() => genererAngles.mutate()}
                >
                  {genererAngles.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                  {t("ugc.personas.valider")}
                </Button>
              )}
            </div>
          </div>

          {faceUrl && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Visuel label={t("ugc.personas.face")} url={faceUrl} />
              {ANGLES.map((angle) => (
                <Visuel
                  key={angle}
                  label={labelAngle(angle)}
                  url={urlParAngle[angle]}
                  action={
                    urlParAngle[angle] ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-full text-xs"
                        disabled={busy}
                        onClick={() => regenererAngleDraft.mutate(angle)}
                      >
                        {angleEnCours === angle ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3" />
                        )}
                        {t("ugc.personas.regenererAngle")}
                      </Button>
                    ) : null
                  }
                />
              ))}
            </div>
          )}

          {/* Prompts d'angles — éditables avant validation et pour refaire un angle */}
          {faceUrl && (etape === "face" || etape === "profile" || etape === "save") && (
            <div className="grid gap-4 lg:grid-cols-3">
              <ChampPrompt
                id="pLeft"
                label={t("ugc.personas.promptLeft")}
                value={promptLeft}
                onChange={setPromptLeft}
                disabled={busy}
              />
              <ChampPrompt
                id="pRight"
                label={t("ugc.personas.promptRight")}
                value={promptRight}
                onChange={setPromptRight}
                disabled={busy}
              />
              <ChampPrompt
                id="pDown"
                label={t("ugc.personas.promptDown")}
                value={promptDown}
                onChange={setPromptDown}
                disabled={busy}
              />
            </div>
          )}

          {/* Étape profil 1:1 — dernière génération avant save */}
          {showProfileStep && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="promptProfile">{t("ugc.personas.promptProfile")}</Label>
                <Badge variant="outline">4 · profil 1:1</Badge>
              </div>
              <textarea
                id="promptProfile"
                className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={promptProfile}
                onChange={(e) => setPromptProfile(e.target.value)}
                disabled={busy}
              />
              <div className="flex flex-wrap items-start gap-4">
                <div className="w-40 shrink-0">
                  <Visuel
                    label={t("ugc.personas.profile")}
                    url={profileUrl}
                    aspect="1/1"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-5">
                  <Button
                    type="button"
                    disabled={busy || !promptProfile.trim()}
                    onClick={() => genererProfil.mutate()}
                  >
                    {genererProfil.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    {profileUrl
                      ? t("ugc.personas.regenererProfil")
                      : t("ugc.personas.genererProfil")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Enregistrement */}
          {etape === "save" && profileUrl && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4">
              <div className="min-w-[200px] flex-1 space-y-2">
                <Label htmlFor="nomPersona">{t("ugc.personas.nom")}</Label>
                <Input
                  id="nomPersona"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder={t("ugc.personas.nomPlaceholder")}
                  disabled={busy}
                />
              </div>
              <Button
                type="button"
                disabled={busy || !nom.trim() || !profileUrl}
                onClick={() => sauver.mutate()}
              >
                {sauver.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                {t("ugc.personas.enregistrer")}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={resetCreation}>
                <RefreshCw />
                {t("ugc.personas.recommencer")}
              </Button>
            </div>
          )}

          {progress && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {progress}
            </p>
          )}
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-medium">{t("ugc.personas.listeTitre")}</h2>
        {liste.isPending && (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
        {liste.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("ugc.personas.listeVide")}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(liste.data ?? []).map((p) => {
            const lies = comptesParPersona.get(p.id) ?? [];
            const profilBusy = listeProfilBusy === p.id;
            return (
            <Card key={p.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2 truncate">
                    <UserRound className="size-4 shrink-0" />
                    {p.nom}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={
                      supprimer.isPending ||
                      Boolean(listeAngleBusy) ||
                      Boolean(listeProfilBusy)
                    }
                    onClick={() => {
                      if (window.confirm(t("ugc.personas.confirmSuppr", { nom: p.nom }))) {
                        supprimer.mutate(p.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardTitle>
                <div className="mt-1.5 space-y-1">
                  {lies.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("ugc.personas.compteLibre")}
                    </p>
                  ) : (
                    lies.map((a) => {
                      const createur = [a.posterPrenom, a.posterNom]
                        .filter(Boolean)
                        .join(" ");
                      const label =
                        a.handle
                          ? `@${a.handle}`
                          : a.personaNom || createur || a.compteId.slice(0, 8);
                      return (
                        <Badge
                          key={a.compteId}
                          variant="secondary"
                          className="max-w-full truncate font-normal"
                          title={
                            createur
                              ? `${createur}${a.handle ? ` · @${a.handle}` : ""}`
                              : label
                          }
                        >
                          {t("ugc.personas.compteLie", { nom: label })}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  <figure className="space-y-1">
                    <img
                      src={p.image_profile_url || p.image_face_url}
                      alt=""
                      className="aspect-square w-full rounded object-cover"
                    />
                    <figcaption className="text-center text-[10px] text-muted-foreground">
                      {t("ugc.personas.profile")}
                    </figcaption>
                  </figure>
                  <figure className="space-y-1">
                    <img
                      src={p.image_face_url}
                      alt=""
                      className="aspect-[9/16] w-full rounded object-cover"
                    />
                    <figcaption className="text-center text-[10px] text-muted-foreground">
                      {t("ugc.personas.face")}
                    </figcaption>
                  </figure>
                  {ANGLES.map((angle) => {
                    const url =
                      angle === "left"
                        ? p.image_left_url
                        : angle === "right"
                          ? p.image_right_url
                          : p.image_down_url;
                    const busyKey = `${p.id}:${angle}`;
                    const enCours = listeAngleBusy === busyKey;
                    return (
                      <figure key={angle} className="space-y-1">
                        <img
                          src={url}
                          alt=""
                          className="aspect-[9/16] w-full rounded object-cover"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 w-full px-1 text-[10px]"
                          disabled={Boolean(listeAngleBusy) || Boolean(listeProfilBusy)}
                          onClick={() => void regenererAnglePersona(p, angle)}
                          title={t("ugc.personas.regenererAngle")}
                        >
                          {enCours ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3" />
                          )}
                          {labelAngle(angle)}
                        </Button>
                      </figure>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  disabled={Boolean(listeAngleBusy) || Boolean(listeProfilBusy)}
                  onClick={() => void regenererProfilPersona(p)}
                >
                  {profilBusy ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  {t("ugc.personas.regenererProfil")}
                </Button>
              </CardContent>
            </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Visuel({
  label,
  url,
  action,
  aspect = "9/16",
}: {
  label: string;
  url: string | null;
  action?: React.ReactNode;
  aspect?: "9/16" | "1/1";
}) {
  const aspectClass = aspect === "1/1" ? "aspect-square" : "aspect-[9/16]";
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
      {url ? (
        <img
          src={url}
          alt=""
          className={`${aspectClass} w-full rounded-lg border object-cover`}
        />
      ) : (
        <div
          className={`flex ${aspectClass} items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground`}
        >
          —
        </div>
      )}
      {action}
    </figure>
  );
}

function ChampPrompt({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
