import { texteContratPapier } from "./papierCmContratTexte";

export function ContratPapierDocument({
  email,
  instagram,
  paysEn,
}: {
  email: string;
  instagram: string;
  paysEn: string;
}) {
  const texte = texteContratPapier({ email, instagram, paysEn });
  const blocs = texte.split(/\n(?=## )/);
  return (
    <div className="space-y-2">
      {blocs.map((bloc, i) => {
        const nl = bloc.indexOf("\n");
        const titre = (nl >= 0 ? bloc.slice(0, nl) : bloc).replace(/^#+\s+/, "").trim();
        const corps = (nl >= 0 ? bloc.slice(nl + 1) : "").trim();
        return (
          <details key={`${i}-${titre}`} className="rounded-lg border bg-card p-3" open={i === 0}>
            <summary className="cursor-pointer text-sm font-medium">{titre}</summary>
            <div className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {corps}
            </div>
          </details>
        );
      })}
    </div>
  );
}
