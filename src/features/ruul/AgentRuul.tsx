import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { importerStatutsRuul, lireAInviterRuul, lireEtatAgentRuul, marquerInvitesRuul, type ResultatStatuts, texteAInviter } from "./api";

const date = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** 0681 : la date du dernier import des statuts Ruul, en haut de la page Ruul. */
export function DernierImportRuul() {
  const etat = useQuery({ queryKey: ["ruul-agent", "etat"], queryFn: lireEtatAgentRuul });
  if (!etat.data) return null;
  const at = etat.data.dernier_import_at;
  const vieux = !at || Date.now() - Date.parse(at) > 48 * 3_600_000;
  return (
    <p className={`text-sm ${vieux ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`} data-testid="ruul-dernier-import">
      Dernier import des statuts Ruul : <b>{at ? date(at) : "jamais"}</b>{vieux ? " · à refaire (plus de 48 h)" : ""}
    </p>
  );
}

/**
 * 0681 (Max, 12/11) : « Agent Ruul ». Trois blocs aux intitulés fixes, pour Max ou un agent
 * qui lit Ruul dans un navigateur : À inviter dans Ruul, Marquer invités, Importer statuts Ruul.
 */
export function AgentRuul() {
  const qc = useQueryClient();
  const etat = useQuery({ queryKey: ["ruul-agent", "etat"], queryFn: lireEtatAgentRuul });
  const aInviter = useQuery({ queryKey: ["ruul-agent", "a-inviter"], queryFn: lireAInviterRuul });
  const [copie, setCopie] = React.useState(false);
  const [invites, setInvites] = React.useState("");
  const [statuts, setStatuts] = React.useState("");
  const [apercu, setApercu] = React.useState<ResultatStatuts | null>(null);
  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: ["ruul-agent"] });
    void qc.invalidateQueries({ queryKey: ["ruul-a-ajouter"] });
  };
  const marquer = useMutation({ mutationFn: () => marquerInvitesRuul(invites), onSuccess: () => { setInvites(""); rafraichir(); } });
  const verifier = useMutation({ mutationFn: () => importerStatutsRuul(statuts, true), onSuccess: setApercu });
  const importer = useMutation({ mutationFn: () => importerStatutsRuul(statuts, false), onSuccess: () => { setStatuts(""); setApercu(null); rafraichir(); } });
  const liste = aInviter.data ?? [];
  const e = etat.data;

  return (
    <Card data-testid="agent-ruul">
      <CardHeader>
        <CardTitle>Agent Ruul</CardTitle>
        <CardDescription>
          Ruul n'a pas d'API : on lit Ruul et on colle ici. Emails A et B {e?.emails_ab ? "🟢 envoyés automatiquement" : "⚪ en pause (interrupteur ruul_emails_ab)"} ·
          à envoyer : A {e?.a_envoyer_a ?? 0}, B {e?.a_envoyer_b ?? 0} · déjà envoyés : A {e?.envoyes_a ?? 0}, B {e?.envoyes_b ?? 0}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2" data-testid="agent-ruul-a-inviter">
          <h3 className="font-semibold">À inviter dans Ruul ({liste.length})</h3>
          <p className="text-xs text-muted-foreground">Signés pas encore dans Ruul. Sans les pays fermés ni les personnes en attente de décision.</p>
          <Textarea aria-label="À inviter dans Ruul" readOnly rows={Math.min(8, Math.max(2, liste.length))} value={texteAInviter(liste)} />
          <Button size="sm" disabled={!liste.length} data-testid="agent-ruul-copier"
            onClick={() => { void navigator.clipboard?.writeText(texteAInviter(liste)); setCopie(true); setTimeout(() => setCopie(false), 2000); }}>
            {copie ? "Copié" : "Copier"}
          </Button>
        </section>

        <section className="space-y-2" data-testid="agent-ruul-marquer">
          <h3 className="font-semibold">Marquer invités</h3>
          <p className="text-xs text-muted-foreground">Colle les emails invités dans Ruul (un par ligne) : ils passent « Ajouté sur Ruul ».</p>
          <Textarea aria-label="Marquer invités" rows={3} value={invites} onChange={(x) => setInvites(x.target.value)} placeholder="ana@gmail.com" />
          <Button size="sm" disabled={!invites.trim() || marquer.isPending} onClick={() => marquer.mutate()} data-testid="agent-ruul-marquer-bouton">Marquer invités</Button>
          {marquer.data && (
            <p className="text-sm" data-testid="agent-ruul-marquer-resultat">
              {marquer.data.marques} marqués · {marquer.data.deja} déjà ajoutés · {marquer.data.introuvables.length} introuvables
              {marquer.data.introuvables.length ? ` : ${marquer.data.introuvables.join(", ")}` : ""}
            </p>
          )}
          {marquer.error && <p className="text-sm text-destructive">{(marquer.error as Error).message}</p>}
        </section>

        <section className="space-y-2" data-testid="agent-ruul-statuts">
          <h3 className="font-semibold">Importer statuts Ruul</h3>
          <p className="text-xs text-muted-foreground">
            Une ligne par personne : « email ; Active » ou « email ; Invited ». Nouveau Invited : email A une seule fois, puis relances.
            Nouveau Active : email B une seule fois. Jamais deux fois le même email.
          </p>
          <Textarea aria-label="Importer statuts Ruul" rows={5} value={statuts} onChange={(x) => { setStatuts(x.target.value); setApercu(null); }}
            placeholder={"ana@gmail.com ; Active\nleo@gmail.com ; Invited"} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!statuts.trim() || verifier.isPending} onClick={() => verifier.mutate()} data-testid="agent-ruul-verifier">Vérifier</Button>
            <Button size="sm" disabled={!apercu || importer.isPending} onClick={() => importer.mutate()} data-testid="agent-ruul-importer">Importer</Button>
          </div>
          {apercu && (
            <p className="text-sm" data-testid="agent-ruul-apercu">
              {apercu.lignes} lignes · {apercu.trouves} trouvées · {apercu.changes} changent · email A à envoyer : {apercu.a_envoyer_a} · email B : {apercu.a_envoyer_b}
              {apercu.introuvables.length ? ` · introuvables : ${apercu.introuvables.join(", ")}` : ""}
              {apercu.illisibles.length ? ` · lignes illisibles : ${apercu.illisibles.length}` : ""}
            </p>
          )}
          {importer.data && <p className="text-sm text-emerald-700 dark:text-emerald-300" data-testid="agent-ruul-importe">Importé : {importer.data.trouves} personnes à jour.</p>}
          {(verifier.error || importer.error) && <p className="text-sm text-destructive">{((verifier.error ?? importer.error) as Error).message}</p>}
        </section>

        <section className="space-y-2" data-testid="agent-ruul-journal">
          <h3 className="font-semibold">Journal des imports</h3>
          {(e?.journal ?? []).length === 0 && <p className="text-sm text-muted-foreground">Aucun import pour l'instant.</p>}
          <ul className="space-y-1 text-sm">
            {(e?.journal ?? []).map((j) => (
              <li key={j.id} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">{date(j.at)}</span>
                <span>{j.par}</span>
                <span>{j.type === "statuts" ? `Statuts : ${j.lignes} lignes, ${j.appliques} à jour (${j.nouveaux_invited} Invited, ${j.nouveaux_active} Active)` : `Invités : ${j.appliques} marqués sur ${j.lignes}`}</span>
                {j.introuvables.length > 0 && <span className="text-amber-700 dark:text-amber-300">{j.introuvables.length} introuvables</span>}
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
