import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { Mico, type EtatMico } from "@/features/onboarding/Mico";
import { cn } from "@/lib/utils";

import { lireLangueDeMonCompte, poserQuestionChatbot } from "./api";
import {
  QUESTION_MAX,
  attenteChat,
  langueDepuisProfil,
  langueDuCompte,
  placeholderChat,
  salutationChat,
  type TourChat,
} from "./prompt";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function nouveauId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ChatWidget() {
  const { t, i18n } = useTranslation();
  const { profil, role } = useAuth();
  // Un poster : la langue de son compte TikTok. Son profil dit « fr » par
  // défaut, d'où une bulle en français pour un poster turc ou allemand.
  const compte = useQuery({
    queryKey: ["chatbot", "langue-compte"],
    queryFn: lireLangueDeMonCompte,
    enabled: role === "poster",
    staleTime: 10 * 60_000,
  });
  const langue = role === "poster"
    ? langueDuCompte(compte.data)
    : langueDepuisProfil(profil?.langues, i18n.resolvedLanguage ?? "fr");
  const [ouvert, setOuvert] = React.useState(false);
  const [content, setContent] = React.useState(false);
  const [texte, setTexte] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const listeRef = React.useRef<HTMLDivElement>(null);
  const champRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = listeRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, ouvert]);

  React.useEffect(() => {
    if (ouvert) champRef.current?.focus();
  }, [ouvert]);

  const envoyer = useMutation({
    mutationFn: async ({ question, historique }: { question: string; historique: TourChat[] }) => {
      return poserQuestionChatbot(question, langue, historique);
    },
    onSuccess: (reponse) => {
      setMessages((prev) => [...prev, { id: nouveauId(), role: "assistant", content: reponse }]);
      setContent(true);
    },
  });

  // Mico, la mascotte : il salue à l'ouverture, réfléchit pendant la réponse,
  // saute de joie quand elle arrive, puis se repose.
  React.useEffect(() => {
    if (!content) return;
    const minuteur = window.setTimeout(() => setContent(false), 2_500);
    return () => window.clearTimeout(minuteur);
  }, [content]);
  const humeur: EtatMico = envoyer.isPending
    ? "think"
    : envoyer.isError
    ? "sad"
    : content
    ? "happy"
    : messages.length === 0
    ? "wave"
    : "idle";

  function soumettre(event?: React.FormEvent) {
    event?.preventDefault();
    const question = texte.trim();
    if (!question || envoyer.isPending) return;
    const historique: TourChat[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setTexte("");
    setMessages((prev) => [...prev, { id: nouveauId(), role: "user", content: question }]);
    envoyer.mutate({ question, historique });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      soumettre();
    }
  }

  // Le bouton vit dans la barre du haut ; le panneau, lui, reste ancré en bas
  // à droite de l'écran, par-dessus la page.
  return (
    <>
      {ouvert && (
        <section
          aria-label={t("chatbot.widgetTitle")}
          className="fixed bottom-4 right-4 z-40 flex h-[min(70vh,32rem)] w-[min(calc(100vw-2rem),24rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-lifted"
        >
          <header className="flex items-center justify-between gap-2 border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-3 py-2">
            <div key={humeur} className="w-10 shrink-0 animate-in zoom-in-50 duration-500" data-testid="mico-bulle" data-humeur={humeur}>
              <Mico etat={humeur} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{t("chatbot.widgetTitle")}</p>
              <p className="truncate text-[11px] text-muted-foreground">{t("chatbot.widgetSous")}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOuvert(false)}
              aria-label={t("common.close")}
            >
              <X />
            </Button>
          </header>

          <div ref={listeRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 scrollbar-slim">
            <Bulle role="assistant">{salutationChat(langue)}</Bulle>
            {messages.map((m) => (
              <Bulle key={m.id} role={m.role}>
                {m.content}
              </Bulle>
            ))}
            {envoyer.isPending && (
              <Bulle role="assistant">
                <span className="text-muted-foreground">{attenteChat(langue)}</span>
              </Bulle>
            )}
            {envoyer.isError && !envoyer.isPending && (
              <p className="px-1 text-xs text-destructive">
                {(envoyer.error as Error).message || t("chatbot.erreur")}
              </p>
            )}
          </div>

          <form onSubmit={soumettre} className="border-t border-border/70 p-2">
            <div className="flex items-end gap-2">
              <textarea
                ref={champRef}
                value={texte}
                onChange={(e) => setTexte(e.target.value.slice(0, QUESTION_MAX))}
                onKeyDown={onKeyDown}
                rows={2}
                maxLength={QUESTION_MAX}
                placeholder={placeholderChat(langue)}
                className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-sm shadow-xs/5 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/24"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!texte.trim() || envoyer.isPending}
                aria-label={t("chatbot.envoyer")}
              >
                <Send />
              </Button>
            </div>
          </form>
        </section>
      )}

      <Button
        type="button"
        variant={ouvert ? "secondary" : "ghost"}
        size="sm"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        aria-label={ouvert ? t("common.close") : t("chatbot.ouvrir")}
      >
        <MessageCircle />
        <span className="hidden sm:inline">{t("chatbot.ouvrir")}</span>
      </Button>
    </>
  );
}

function Bulle({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div
      dir="auto"
      className={cn(
        "max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed",
        role === "user"
          ? "ml-auto bg-primary text-primary-foreground"
          : "mr-auto bg-muted text-foreground",
      )}
    >
      {children}
    </div>
  );
}
