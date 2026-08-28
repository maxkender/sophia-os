import * as React from "react";
import { NavLink } from "react-router-dom";

import { SophiaLogo } from "@/components/brand/SophiaLogo";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/ui/sheet";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Explication courte, montrée en infobulle au survol (garde la nav compacte). */
  description?: string;
}

/** Un bloc de navigation, avec un intitulé de section optionnel. */
export interface NavGroup {
  title?: string;
  items: NavItem[];
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5 px-3 py-2">
      {groups.map((groupe, i) => (
        <div key={groupe.title ?? i} className="flex flex-col gap-0.5">
          {groupe.title && (
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/70">
              {groupe.title}
            </p>
          )}
          {groupe.items.map(({ to, label, icon: Icon, description }) => (
            <NavLink
              key={to}
              to={to}
              end
              onClick={onNavigate}
              title={description}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      isActive
                        ? "text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground",
                    )}
                  />
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Brand({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-5" aria-label={title}>
      <SophiaLogo />
      <div className="min-w-0">
        <p className="font-heading truncate text-base font-semibold tracking-tight text-sidebar-accent-foreground">
          Sophia
        </p>
        <p className="truncate text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground">
          OS
        </p>
      </div>
    </div>
  );
}

export function Sidebar({
  title,
  groups,
  footer,
}: {
  title: string;
  groups: NavGroup[];
  footer?: React.ReactNode;
}) {
  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar lg:flex">
      <Brand title={title} />
      <Separator className="mx-3 w-auto bg-sidebar-border" />
      <div className="flex-1 overflow-y-auto scrollbar-slim">
        <NavList groups={groups} />
      </div>
      {footer && (
        <div className="border-t border-sidebar-border p-3">{footer}</div>
      )}
    </aside>
  );
}

/** Tiroir mobile : Sheet coss, même contenu que la sidebar desktop. */
export function MobileDrawer({
  open,
  onClose,
  title,
  groups,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  groups: NavGroup[];
  footer?: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetPopup
        side="left"
        showCloseButton
        className="w-72 max-w-[calc(100vw-2rem)] bg-sidebar"
      >
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <Brand title={title} />
        </SheetHeader>
        <SheetPanel className="p-0" scrollFade={false}>
          <NavList groups={groups} onNavigate={onClose} />
        </SheetPanel>
        {footer && (
          <div className="border-t border-sidebar-border p-3">{footer}</div>
        )}
      </SheetPopup>
    </Sheet>
  );
}
