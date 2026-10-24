import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Eye, LogOut, Menu } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/features/auth/AuthContext";
import { signOut } from "@/features/auth/api";
import { ACCUEIL_HO } from "@/features/auth/pagesHeadOfOps";
import { SUPPORTED_LANGUAGES } from "@/locales";
import { ChatWidget } from "@/features/chatbot/ChatWidget";
import { MobileDrawer, Sidebar, type NavGroup } from "./Sidebar";

interface ProfilAffiche {
  prenom: string | null;
  nom: string | null;
  email: string | null;
}

/** Prénom + nom si on les a, sinon l'email : un poster doit toujours se
 *  reconnaître dans la barre latérale. */
function nomAffiche(profil: ProfilAffiche | null): string | null {
  if (!profil) return null;
  const complet = [profil.prenom, profil.nom].filter(Boolean).join(" ");
  return complet || profil.email;
}

function initiales(profil: ProfilAffiche | null): string {
  const nom = nomAffiche(profil);
  if (!nom) return "?";
  return nom
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function UserBlock() {
  const { profil } = useAuth();
  return (
    <div className="flex items-center gap-2.5 px-1 py-1">
      <Avatar className="size-8">
        <AvatarFallback className="bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
          {initiales(profil)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm text-sidebar-accent-foreground">
        {nomAffiche(profil) ?? "—"}
      </span>
    </div>
  );
}

export function AppShell({
  navLabel,
  groups,
  children,
  sidebarExtra,
}: {
  navLabel: string;
  groups: NavGroup[];
  children: React.ReactNode;
  sidebarExtra?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { roleReel, apercuHo, basculerApercuHo } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const langue = i18n.resolvedLanguage ?? "fr";

  // Aperçu Head of Ops : l'admin voit l'OS comme lui, sans son mot de passe.
  const apercu = (actif: boolean) => {
    basculerApercuHo(actif);
    navigate(actif ? ACCUEIL_HO : "/admin");
  };

  const footer = (
    <div className="space-y-3">
      {sidebarExtra}
      {roleReel === "admin" && !apercuHo && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => apercu(true)}>
          <Eye />
          {t("headOfOps.voirComme")}
        </Button>
      )}
      <UserBlock />
    </div>
  );

  return (
    <div className="flex min-h-svh bg-background">
      <Sidebar title={t("app.name")} groups={groups} footer={footer} />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t("app.name")}
        groups={groups}
        footer={footer}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setDrawerOpen(true)}
                aria-label="Ouvrir le menu"
              >
                <Menu />
              </Button>
              <span className="font-heading truncate text-sm font-semibold tracking-tight">
                {navLabel}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Dans la barre plutôt qu'en bulle flottante : la bulle cachait
                  le bord droit des pages. */}
              <ChatWidget />
              {SUPPORTED_LANGUAGES.length > 1 && (
                <Select
                  value={langue}
                  onValueChange={(value) => {
                    if (typeof value === "string") void i18n.changeLanguage(value);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="langue"
                    className="min-w-16 w-20"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              )}
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut />
                <span className="hidden sm:inline">{t("auth.logout")}</span>
              </Button>
            </div>
          </div>
          {apercuHo && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 lg:px-8">
              <span>{t("headOfOps.apercu")}</span>
              <Button size="sm" variant="outline" onClick={() => apercu(false)}>
                {t("headOfOps.quitterApercu")}
              </Button>
            </div>
          )}
        </header>

        <main className="flex-1 animate-fade-in px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
