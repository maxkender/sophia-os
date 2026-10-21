import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  creerChatbotContexte,
  listerChatbotContexte,
  majChatbotContexte,
  supprimerChatbotContexte,
  type ChatbotContexte,
  type QuestionFaq,
} from "@/features/chatbot/api";
import { FaqAdmin } from "@/features/chatbot/FaqAdmin";
import type { AudienceSnippet } from "@/features/chatbot/prompt";

function labelAudience(aud: AudienceSnippet, t: (k: string) => string): string {
  if (aud === "poster") return t("chatbot.rolePoster");
  if (aud === "hiring_manager") return t("chatbot.roleHm");
  if (aud === "admin") return t("chatbot.roleAdmin");
  return t("chatbot.audienceTous");
}

/** Une réponse validée se range pour le rôle de celui qui a demandé. */
function audienceDuRole(role: string): AudienceSnippet {
  if (role === "poster") return "poster";
  if (role === "hiring_manager" || role === "directing_manager" || role === "head_of_ops") return "hiring_manager";
  if (role === "admin") return "admin";
  return "all";
}

function EditeurSnippet({
  initial,
  onAnnuler,
  onSauve,
}: {
  initial?: { id?: string; titre: string; contenu: string; audience?: AudienceSnippet };
  onAnnuler?: () => void;
  onSauve: () => void;
}) {
  const { t } = useTranslation();
  const [titre, setTitre] = React.useState(initial?.titre ?? "");
  const [contenu, setContenu] = React.useState(initial?.contenu ?? "");
  const [audience, setAudience] = React.useState<AudienceSnippet>(initial?.audience ?? "all");

  const sauver = useMutation({
    mutationFn: async () => {
      if (initial?.id) await majChatbotContexte(initial.id, { titre, contenu, audience });
      else await creerChatbotContexte(titre, contenu, audience);
    },
    onSuccess: onSauve,
  });

  return (
    <div className="space-y-3 rounded-md border border-border/80 bg-muted/30 p-3">
      <Input
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        placeholder={t("chatbot.titrePlaceholder")}
      />
      <select
        aria-label={t("chatbot.audience")}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        value={audience}
        onChange={(e) => setAudience(e.target.value as AudienceSnippet)}
      >
        <option value="all">{t("chatbot.audienceTous")}</option>
        <option value="admin">{t("chatbot.roleAdmin")}</option>
        <option value="hiring_manager">{t("chatbot.roleHm")}</option>
        <option value="poster">{t("chatbot.rolePoster")}</option>
      </select>
      <Textarea
        value={contenu}
        onChange={(e) => setContenu(e.target.value)}
        rows={6}
        placeholder={t("chatbot.contenuPlaceholder")}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!contenu.trim() || sauver.isPending}
          onClick={() => sauver.mutate()}
        >
          {sauver.isPending ? t("common.saving") : t("common.save")}
        </Button>
        {onAnnuler && (
          <Button variant="ghost" onClick={onAnnuler}>
            {t("common.cancel")}
          </Button>
        )}
        {sauver.isError && (
          <p className="text-xs text-destructive">{(sauver.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}

function LigneContexte({
  snippet,
  onChange,
}: {
  snippet: ChatbotContexte;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = React.useState(false);
  const supprimer = useMutation({
    mutationFn: () => supprimerChatbotContexte(snippet.id),
    onSuccess: onChange,
  });

  if (edit) {
    return (
      <EditeurSnippet
        initial={snippet}
        onAnnuler={() => setEdit(false)}
        onSauve={() => {
          setEdit(false);
          onChange();
        }}
      />
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{snippet.titre}</p>
          <Badge variant="secondary">{labelAudience(snippet.audience ?? "all", t)}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
            {t("common.edit")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={supprimer.isPending}
            onClick={() => {
              if (window.confirm(t("chatbot.confirmSuppr"))) supprimer.mutate();
            }}
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{snippet.contenu}</p>
    </div>
  );
}

export function AdminChatbotPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [nouveau, setNouveau] = React.useState(false);
  const [brouillon, setBrouillon] = React.useState<{
    titre: string;
    contenu: string;
    audience: AudienceSnippet;
  } | null>(null);
  const formRef = React.useRef<HTMLDivElement>(null);

  const contexte = useQuery({ queryKey: ["chatbot-contexte"], queryFn: listerChatbotContexte });

  const rafraichirContexte = () => {
    void queryClient.invalidateQueries({ queryKey: ["chatbot-contexte"] });
    setNouveau(false);
    setBrouillon(null);
  };

  /** Depuis le journal : la question, et la réponse de l'équipe s'il y en a une. */
  function ajouterDepuisQuestion(q: QuestionFaq) {
    const reponse = q.reponse_humaine ?? q.reponse_admin ?? "";
    setBrouillon({
      titre: q.question.slice(0, 80),
      contenu: `${t("chatbot.questionLabel")} : ${q.question}\n\n${t("chatbot.reponseLabel")} :\n${reponse}`,
      audience: audienceDuRole(q.role),
    });
    setNouveau(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("chatbot.pageTitle")}</CardTitle>
          <CardDescription>{t("chatbot.pageSubtitle")}</CardDescription>
        </CardHeader>
      </Card>

      <FaqAdmin onAjouterReponse={ajouterDepuisQuestion} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("chatbot.contextTitle")}</CardTitle>
          <CardDescription>{t("chatbot.contextSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div ref={formRef}>
            {nouveau ? (
              <EditeurSnippet
                key={brouillon ? `q-${brouillon.titre}` : "nouveau"}
                initial={brouillon ?? undefined}
                onAnnuler={() => {
                  setNouveau(false);
                  setBrouillon(null);
                }}
                onSauve={rafraichirContexte}
              />
            ) : (
              <Button variant="outline" onClick={() => setNouveau(true)}>
                <Plus />
                {t("chatbot.nouveau")}
              </Button>
            )}
          </div>
          {contexte.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {contexte.data?.length === 0 && !nouveau && (
            <EmptyState title={t("chatbot.contexteVide")} description={t("chatbot.contexteVideAide")} />
          )}
          {contexte.data?.map((s) => (
            <LigneContexte key={s.id} snippet={s} onChange={rafraichirContexte} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
