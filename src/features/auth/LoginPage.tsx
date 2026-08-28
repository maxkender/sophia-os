import * as React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Briefcase, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInWithPassword } from "./api";

type AccessKey = "admin" | "manager" | "creator";

interface AccessCard {
  key: AccessKey;
  icon: LucideIcon;
  labelKey: string;
  descKey: string;
}

const CARDS: AccessCard[] = [
  { key: "admin", icon: ShieldCheck, labelKey: "auth.accessAdmin", descKey: "auth.accessAdminDesc" },
  { key: "manager", icon: Briefcase, labelKey: "auth.accessManager", descKey: "auth.accessManagerDesc" },
  { key: "creator", icon: Users, labelKey: "auth.accessCreator", descKey: "auth.accessCreatorDesc" },
];

export function LoginPage() {
  const { t } = useTranslation();
  const [choisi, setChoisi] = React.useState<AccessCard | null>(null);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await signInWithPassword(email, password);

    setSubmitting(false);
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes("invalid")
          ? t("auth.errorInvalidCredentials")
          : t("auth.errorGeneric"),
      );
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      {!choisi ? (
        <div className="w-full max-w-2xl animate-brand-in text-center">
          <span className="brand-mark mx-auto" aria-hidden>
            S
          </span>
          <p className="font-heading mt-5 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Sophia
          </p>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">{t("auth.tagline")}</p>

          <div className="mx-auto mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
            {CARDS.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => {
                  setError(null);
                  setChoisi(card);
                }}
                className="colorion-fill-up group flex flex-col items-center gap-2 rounded-2xl border bg-card px-4 py-5 text-center shadow-xs/5"
              >
                <card.icon className="size-5 text-foreground transition-transform group-hover:scale-105" />
                <span className="text-sm font-semibold tracking-tight">{t(card.labelKey)}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {t(card.descKey)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 text-center">
            <span className="brand-mark mx-auto" aria-hidden>
              S
            </span>
            <p className="font-heading mt-4 text-3xl font-semibold tracking-tight">Sophia</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("auth.tagline")}</p>
          </div>

          <Card>
            <CardHeader className="pb-0">
              <button
                type="button"
                onClick={() => setChoisi(null)}
                className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                {t("auth.changeAccess")}
              </button>
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <choisi.icon className="size-4" />
                </span>
                <div>
                  <CardTitle className="text-base">{t(choisi.labelKey)}</CardTitle>
                  <CardDescription>{t("auth.loginSubtitle")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardPanel>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Field>
                  <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="toi@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                {error && (
                  <Alert variant="error">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" loading={submitting}>
                  {submitting ? t("auth.submitting") : t("auth.submit")}
                </Button>
              </form>
            </CardPanel>
          </Card>
        </div>
      )}
    </div>
  );
}
