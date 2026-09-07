import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "i18next";

import "@/locales";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimelineCreateur, TimelinePhase0 } from "./Timeline";
import type { RecrutementCreateur, RecrutementHm } from "./types";

function hm(p: Partial<RecrutementHm> = {}): RecrutementHm {
  return {
    id: "h1",
    profile_id: null,
    upwork_freelancer_id: "uw1",
    upwork_profile_url: null,
    avatar_url: null,
    prenom: "Ada",
    nom: "Lovelace",
    nom_affiche: "Ada Lovelace",
    pays: ["fr"],
    email_os: "adal@sophia.com",
    email_perso: null,
    slack_user_id: null,
    talks_at: "2026-09-01T10:00:00Z",
    contrat_envoye_at: "2026-09-02T10:00:00Z",
    contrat_signe_at: "2026-09-03T10:00:00Z",
    codes_envoyes_at: null,
    slack_invite_envoyee_at: null,
    email_perso_demandee_at: null,
    rejoint_slack_at: null,
    rejoint_os_at: null,
    ajoute_upwork_at: null,
    job_post_at: null,
    job_post_id: null,
    job_post_titre: null,
    cible_createurs: 10,
    notes: null,
    dernier_message: null,
    dernier_message_at: null,
    dernier_message_auteur: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...p,
  };
}

function cre(p: Partial<RecrutementCreateur> = {}): RecrutementCreateur {
  return {
    id: "c1",
    hm_id: "h1",
    profile_id: "p1",
    pays: "fr",
    upwork_freelancer_id: null,
    upwork_profile_url: null,
    avatar_url: null,
    prenom: "A",
    nom: "A",
    nom_affiche: "A A",
    email_os: null,
    email_perso: null,
    slack_user_id: null,
    talks_at: "2026-09-01T10:00:00Z",
    contrat_envoye_at: null,
    contrat_signe_at: null,
    codes_envoyes_at: null,
    slack_invite_envoyee_at: null,
    rejoint_os_at: null,
    rejoint_slack_at: null,
    warmup_at: null,
    premier_post_at: null,
    dernier_message: null,
    dernier_message_at: null,
    dernier_message_auteur: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...p,
  };
}

function renderRail(node: ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>);
}

describe("Timeline Recrutements", () => {
  beforeEach(() => {
    void i18n.changeLanguage("fr");
  });

  it("phase 0 : icônes nommées, dates des étapes faites, étape en cours", () => {
    renderRail(<TimelinePhase0 hm={hm()} />);
    expect(screen.getByRole("button", { name: "Talks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contrat envoyé" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contrat signé" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accès OS + Slack" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: "Checklist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Job post" })).toBeInTheDocument();
    expect(screen.getByText("Accès OS + Slack · En cours")).toBeInTheDocument();
    expect(screen.getAllByText(/En cours/).length).toBeGreaterThan(0);
  });

  it("créateur : talks fait, contrat en cours", () => {
    renderRail(<TimelineCreateur createur={cre()} />);
    expect(screen.getByRole("button", { name: "Talks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contrat" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Codes + Slack" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A rejoint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Warmup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1er post" })).toBeInTheDocument();
    expect(screen.getByText("Contrat · En cours")).toBeInTheDocument();
  });
});
