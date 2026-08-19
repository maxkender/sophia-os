import * as React from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { CompteursPhases, ListeCreateursSuivi } from "@/features/hiring/SuiviCreateurs";
import {
  additionnerCompteurs,
  createursDuManager,
  hmsDuDm,
  resumeHm,
} from "@/features/hiring/suiviEquipe";
import { LabelPicker } from "@/features/moteur/LabelPicker";
import { nomLangue } from "@/features/moteur/langues";
import {
  creerRecruteur,
  listerLanguesReference,
  listerPosters,
  majLanguesRecruteur,
} from "@/features/moteur/api";
import type { PosterProfil } from "@/features/moteur/types";

const filtreLabelUgcVideoThematique = (lab: {
  slug: string;
  ugc_ai_video: boolean;
}) => Boolean(lab.ugc_ai_video) && lab.slug !== "ugc-ai-video";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function nomAffiche(p: PosterProfil): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || p.id.slice(0, 8);
}

function LanguesHm({ recruteur }: { recruteur: PosterProfil }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const maj = useMutation({
    mutationFn: (l: string[]) => majLanguesRecruteur(recruteur.id, l),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posters"] }),
  });
  const actives = recruteur.langues ?? [];
  const libelle = (l: string) => nomLangue(l, i18n.language);
  const resume = actives.length > 0 ? actives.map(libelle).join(", ") : t("posters.aucuneLangue");

  return (
    <select
      className={selectClass}
      value=""
      disabled={maj.isPending}
      title={resume}
      onChange={(e) => {
        const l = e.target.value;
        if (!l) return;
        const s = new Set(actives);
        if (s.has(l)) s.delete(l);
        else s.add(l);
        maj.mutate([...s]);
      }}
    >
      <option value="">{resume}</option>
      {(langues.data ?? []).map((l) => (
        <option key={l} value={l}>
          {actives.includes(l) ? `✓ ${libelle(l)}` : libelle(l)}
        </option>
      ))}
    </select>
  );
}

/** Directing manager : créer et paramétrer des hiring managers. */
export function HiringRecruteursPage() {
  const { t, i18n } = useTranslation();
  const { role, user } = useAuth();
  const queryClient = useQueryClient();

  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });

  const [prenom, setPrenom] = React.useState("");
  const [nom, setNom] = React.useState("");
  const [recLangues, setRecLangues] = React.useState<string[]>([]);
  const [ugcAiVideo, setUgcAiVideo] = React.useState(false);
  const [ugcLabels, setUgcLabels] = React.useState<string[]>([]);
  const [cree, setCree] = React.useState<{ email: string } | null>(null);

  const basculerLangue = (l: string) =>
    setRecLangues((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const creer = useMutation({
    mutationFn: () =>
      creerRecruteur({
        prenom,
        nom,
        langues: recLangues,
        ugc_ai_video: ugcAiVideo,
        ugc_ai_video_label_ids: ugcAiVideo ? ugcLabels : undefined,
      }),
    onSuccess: (r) => {
      setCree({ email: r.email });
      setPrenom("");
      setNom("");
      setRecLangues([]);
      setUgcAiVideo(false);
      setUgcLabels([]);
      void queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });

  if (role !== "directing_manager") {
    return <Navigate to="/embauche" replace />;
  }

  const tous = posters.data ?? [];
  const hms = user?.id ? hmsDuDm(tous, user.id) : [];
  const resumes = hms.map((hm) => resumeHm(hm, tous));
  const totaux = additionnerCompteurs(resumes.map((r) => r.compteurs));

  return (
    <div className="space-y-6">
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            {t("hiring.creerHm")}
          </CardTitle>
          <CardDescription>{t("hiring.creerHmDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setCree(null);
              creer.mutate();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="dmHmPrenom">{t("posters.prenom")}</Label>
              <Input
                id="dmHmPrenom"
                required
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dmHmNom">{t("posters.nom")}</Label>
              <Input id="dmHmNom" value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("posters.languesRecruteur")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {(langues.data ?? []).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => basculerLangue(l)}
                    className={
                      recLangues.includes(l)
                        ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                        : "rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                    }
                  >
                    {nomLangue(l, i18n.language)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("posters.languesRecruteurAide")}</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={ugcAiVideo}
                  onChange={(e) => {
                    setUgcAiVideo(e.target.checked);
                    if (!e.target.checked) setUgcLabels([]);
                  }}
                />
                <span>
                  <span className="font-medium">{t("posters.hmUgcAiVideo")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("posters.hmUgcAiVideoAide")}
                  </span>
                </span>
              </label>
              {ugcAiVideo && (
                <div className="space-y-1.5 rounded-md border border-dashed p-3">
                  <Label>{t("posters.hmUgcAiVideoLabels")}</Label>
                  <LabelPicker
                    selected={ugcLabels}
                    onChange={setUgcLabels}
                    filter={filtreLabelUgcVideoThematique}
                  />
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={
                  creer.isPending ||
                  !prenom.trim() ||
                  recLangues.length === 0 ||
                  (ugcAiVideo && ugcLabels.length === 0)
                }
              >
                {creer.isPending ? t("common.saving") : t("hiring.creerHm")}
              </Button>
              {creer.isError && (
                <p className="mt-2 text-sm text-destructive">{(creer.error as Error).message}</p>
              )}
              {cree && (
                <p className="mt-2 text-sm text-success">
                  {t("posters.done")} — <code className="rounded bg-muted px-1">{cree.email}</code> ·{" "}
                  <code className="rounded bg-muted px-1">12345678</code>
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("hiring.mesHm")}</CardTitle>
          <CardDescription>{t("hiring.mesHmDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {posters.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {!posters.isPending && hms.length === 0 && <EmptyState title={t("hiring.aucunHm")} />}
          {!posters.isPending && hms.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("hiring.equipeTotaux", { hms: hms.length })} · <CompteursPhases compteurs={totaux} />
            </p>
          )}
          {resumes.map(({ hm, compteurs }) => (
            <div key={hm.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{nomAffiche(hm)}</span>
                <Badge variant="outline">HM</Badge>
                {hm.hm_ugc_ai_video && <Badge variant="secondary">{t("posters.hmUgcAiVideoBadge")}</Badge>}
                <span className="text-xs text-muted-foreground">{hm.email}</span>
              </div>
              <LanguesHm recruteur={hm} />
              <CompteursPhases compteurs={compteurs} />
              <ListeCreateursSuivi createurs={createursDuManager(tous, hm.id)} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
