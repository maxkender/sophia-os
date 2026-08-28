import type * as React from "react";

import { SophiaLogo } from "@/components/brand/SophiaLogo";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";

/** Cadre commun aux écrans auth secondaires (changement MDP…). */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 text-center animate-brand-in">
        <SophiaLogo size="md" className="mx-auto" />
        <p className="font-heading mt-4 text-3xl font-semibold tracking-tight">Sophia</p>
      </div>

      <Card className="w-full max-w-sm animate-fade-in">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardPanel>{children}</CardPanel>
      </Card>

      {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
