import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Square, Star, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { listerVoixPapier, previewVoixPapier } from "@/features/moteur/api";
import { LANGUES_CIBLES, drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { VOIX_PAPIER_CATALOGUE } from "@/features/moteur/papierReglages";
import {
  assurerVoixSelectionnee,
  catalogueVersVoixEleven,
  estVoixLegacyDefaut,
  filtrerVoixParLangue,
  labelVoixEleven,
  voixDefautDepuisListe,
  voixOrdonneesEleven,
  type VoixEleven,
} from "@/features/moteur/papierVoix";
import { cn } from "@/lib/utils";

function fallbackVoix(langue: string): VoixEleven[] {
  return filtrerVoixParLangue(catalogueVersVoixEleven(VOIX_PAPIER_CATALOGUE), langue);
}

function audioDepuisBase64(b64: string, mime = "audio/mpeg"): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function SelectVoixEleven({
  id,
  value,
  onChange,
  favoris = [],
  onFavori,
  disabled,
  langueFixe,
  allowEmpty,
  emptyLabel,
  autoDefaut = !allowEmpty,
  compact,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  favoris?: string[];
  onFavori?: (v: string) => void;
  disabled?: boolean;
  langueFixe?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  autoDefaut?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [langue, setLangue] = React.useState(langueFixe ?? "fr");
  const [playing, setPlaying] = React.useState(false);
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const [previewErr, setPreviewErr] = React.useState("");
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = React.useRef<string | null>(null);
  const autoRef = React.useRef("");

  React.useEffect(() => {
    if (langueFixe) setLangue(langueFixe);
  }, [langueFixe]);

  React.useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const q = useQuery({
    queryKey: compact ? ["papier-voix-lib"] : ["papier-voix", langue],
    queryFn: () => listerVoixPapier(compact ? undefined : langue),
  });

  const liste = React.useMemo(() => {
    const raw = q.data?.voix?.length ? q.data.voix : fallbackVoix(langue);
    const filtrees = filtrerVoixParLangue(raw, langue);
    return voixOrdonneesEleven(favoris, assurerVoixSelectionnee(filtrees, value));
  }, [q.data?.voix, langue, favoris, value]);

  React.useEffect(() => {
    if (!autoDefaut || allowEmpty || !q.data?.voix?.length) return;
    if (value && !estVoixLegacyDefaut(value)) return;
    const defaut = voixDefautDepuisListe(q.data.voix, langue);
    if (!defaut || defaut === value) return;
    const cle = `${langue}:${defaut}`;
    if (autoRef.current === cle) return;
    autoRef.current = cle;
    onChange(defaut);
  }, [autoDefaut, allowEmpty, q.data?.voix, value, langue, onChange]);

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  }

  async function ecouter() {
    if (!value) return;
    setPreviewErr("");
    if (playing) {
      stop();
      return;
    }
    stop();
    setPreviewBusy(true);
    try {
      const choisie = liste.find((v) => v.id === value || v.name === value);
      let url = choisie?.previewUrl ?? "";
      if (!url) {
        const r = await previewVoixPapier({ voiceId: value, langue });
        if (r.previewUrl) url = r.previewUrl;
        else if (r.audioBase64) {
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          url = audioDepuisBase64(r.audioBase64, r.mime);
          blobUrlRef.current = url;
        }
      }
      if (!url) throw new Error(t("papier.voixPreviewVide"));
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setPlaying(false);
        setPreviewErr(t("papier.voixPreviewErreur"));
      };
      await audio.play();
      setPlaying(true);
    } catch (err) {
      setPreviewErr(err instanceof Error ? err.message : t("papier.voixPreviewErreur"));
    } finally {
      setPreviewBusy(false);
    }
  }

  const hasKey = q.data?.hasKey ?? false;

  return (
    <div className="space-y-2">
      {compact ? null : <Label htmlFor={id}>{t("papier.voix")}</Label>}
      <div className={cn("grid gap-2", langueFixe ? "sm:grid-cols-1" : "sm:grid-cols-2")}>
        {langueFixe ? null : (
          <div className="space-y-1">
            <Label htmlFor={`${id}-langue`} className="text-xs text-muted-foreground">
              {t("papier.voixLangue")}
            </Label>
            <select
              id={`${id}-langue`}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={langue}
              disabled={disabled}
              onChange={(e) => setLangue(e.target.value)}
            >
              {LANGUES_CIBLES.map((code) => (
                <option key={code} value={code}>
                  {drapeauLangue(code)} {nomLangue(code)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          {langueFixe ? null : (
            <Label htmlFor={id} className="text-xs text-muted-foreground">
              {t("papier.voixLocuteur")}
            </Label>
          )}
          <div className="flex items-center gap-2">
            <select
              id={id}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value}
              disabled={disabled || q.isLoading}
              onChange={(e) => onChange(e.target.value)}
            >
              {allowEmpty ? <option value="">{emptyLabel ?? t("reglages.papierVoixSuivre")}</option> : null}
              {liste.map((v) => (
                <option key={v.id} value={v.id}>
                  {favoris.includes(v.id) || favoris.includes(v.name) ? "★ " : ""}
                  {labelVoixEleven(v)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0"
              disabled={disabled || !value || previewBusy}
              title={playing ? t("papier.voixStop") : t("papier.voixEcouter")}
              onClick={() => void ecouter()}
            >
              {previewBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : playing ? (
                <Square className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            {onFavori ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0"
                disabled={disabled || !value}
                title={t("papier.voixFavori")}
                onClick={() => onFavori(value)}
              >
                <Star className={cn("h-4 w-4", favoris.includes(value) && "fill-amber-400 text-amber-400")} />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {q.isLoading && !compact ? <p className="text-xs text-muted-foreground">{t("papier.voixChargement")}</p> : null}
      {q.data?.erreur && !compact ? <p className="text-xs text-destructive">{q.data.erreur}</p> : null}
      {previewErr ? <p className="text-xs text-destructive">{previewErr}</p> : null}
      {compact ? null : !q.isLoading && !hasKey ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t("papier.voixSansCle")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("papier.voixAide")}</p>
      )}
    </div>
  );
}
