/**
 * 18/11 (Max) : à la place du dashboard, le posteur dont la collaboration est terminée (kill, ou à sa demande) lit
 * pourquoi, ce qui lui est payé et quand, dans sa langue. Ni calendrier, ni posts, ni téléchargements : seulement Help
 * (questions de paie) et la déconnexion. Un nouveau compte pas encore activé garde l'écran « en attente ».
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CircleHelp, HeartHandshake, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { SophiaLogo } from "@/components/brand/SophiaLogo";
import { FullPageLoader } from "@/components/layout/FullPageLoader";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/api";
import { PageHelp } from "@/features/support/PageHelp";

import { decouper, lireMaFin, type MaFin } from "./api";

export const CHEMIN_HELP = "/createur/help";

/** Posteur désactivé : la fin de collaboration si c'en est une, sinon `attente` (nouveau compte). */
export function CompteInactif({ attente }: { attente: ReactNode }) {
  const q = useQuery({ queryKey: ["ma-fin"], queryFn: lireMaFin, staleTime: 60_000, retry: 1 });
  const { pathname } = useLocation();
  if (q.isLoading) return <FullPageLoader />;
  if (!q.data) return <>{attente}</>;
  if (pathname === CHEMIN_HELP) return <HelpSeul />;
  return <FinCollaboration fin={q.data} />;
}

export function FinCollaboration({ fin }: { fin: MaFin }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { titre, lignes, fin: merci } = decouper(fin.texte ?? t(fin.cas === "demande" ? "auth.finDemande" : "auth.finKill"));
  return (
    <div className="flex min-h-svh flex-col items-center bg-gradient-to-b from-muted/60 via-background to-background px-4 py-10 sm:justify-center" data-testid="fin-collaboration">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex justify-center"><SophiaLogo /></div>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col items-center gap-3 border-b bg-muted/30 px-6 pb-6 pt-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
              <HeartHandshake className="size-6 text-muted-foreground" aria-hidden />
            </span>
            <h1 className="text-balance text-xl font-semibold leading-snug tracking-tight">{titre}</h1>
          </div>
          {lignes.length > 0 && (
            <div className="divide-y">
              {lignes.map((l) => <Ligne key={l} texte={l} />)}
            </div>
          )}
          {merci && <p className="border-t bg-muted/20 px-6 py-4 text-center text-sm text-muted-foreground">{merci}</p>}
        </div>
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">{t("auth.finAide")}</p>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={() => navigate(CHEMIN_HELP)}>
              <CircleHelp className="size-4" /> {t("auth.finHelp")}
            </Button>
            <Button variant="outline" onClick={() => signOut()}>
              <LogOut className="size-4" /> {t("auth.logout")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** « Reason: … » / « Payment: … » (dans sa langue) : l'intitulé en petit, le contenu dessous. */
function Ligne({ texte }: { texte: string }) {
  const m = /^([^:：]{2,24})[:：]\s*(.+)$/.exec(texte);
  if (!m) return <p className="px-6 py-4 text-sm leading-relaxed">{texte}</p>;
  return (
    <div className="px-6 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{m[1]}</p>
      <p className="mt-1 text-sm leading-relaxed">{m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1)}</p>
    </div>
  );
}

/** Help, seul (sans le menu du dashboard), pour les questions de paie après la fin. */
function HelpSeul() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="mx-auto min-h-svh max-w-3xl space-y-4 bg-background px-4 py-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
        <ArrowLeft className="size-4" /> {t("auth.finRetour")}
      </Button>
      <PageHelp />
    </div>
  );
}
