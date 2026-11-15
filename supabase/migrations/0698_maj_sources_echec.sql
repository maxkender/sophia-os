-- 0698 : une mise à jour de source qui échoue se voit (demande d'Adrien du
-- 13/11, après la clé Apify refusée : la source rendait « rien à rattraper »).
--
--   * `bleo_sources_decisions.echec` : la raison du dernier échec de la source
--     cette semaine (clé refusée, profil illisible, autre erreur).
--   * `maj_sources_echec(source, message)` : écrit l'échec et remet la source
--     dans la file (elle repart au lot suivant) ; message nul : l'échec est levé.
--     Appelée par la fonction d'import.
--   * `sources_file()` rend `echec` pour chaque source en attente.
--
-- ✅ Appliquée le 2026-11-13 (MCP).
--
-- Retour arrière : la fonction et les colonnes peuvent rester ; retirer `echec`
-- de `sources_file()` en la recréant depuis 0686.

set lock_timeout = '5s';

alter table public.bleo_sources_decisions
  add column if not exists echec text,
  add column if not exists echec_le timestamptz;

comment on column public.bleo_sources_decisions.echec is
  'Raison du dernier échec de la mise à jour de la source cette semaine (0698) ; nulle : pas d''échec.';

create or replace function public.maj_sources_echec(p_compte uuid, p_message text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
begin
  if p_message is null then
    update bleo_sources_decisions set echec = null, echec_le = null
     where semaine = v_semaine and compte_reference_id = p_compte and echec is not null;
  else
    -- La source repart au lot suivant : sa mise à jour n'a pas eu lieu.
    update bleo_sources_decisions set echec = left(p_message, 500), echec_le = now(), lancee_le = null
     where semaine = v_semaine and compte_reference_id = p_compte;
  end if;
end;
$function$;

comment on function public.maj_sources_echec(uuid, text) is
  'Sources (0698) : note l''échec d''une mise à jour (la source repart au lot suivant) ou le lève (message nul).';

revoke all on function public.maj_sources_echec(uuid, text) from public, anon, authenticated;
grant execute on function public.maj_sources_echec(uuid, text) to service_role;

-- `sources_file()` : chaque source en attente porte son dernier échec.
do $patch$
declare
  d text := pg_get_functiondef('public.sources_file()'::regprocedure);
  paires text[] := array[
    $a$cr.essai_max, d.raison, d.r_mediane,$a$, $b$cr.essai_max, d.raison, d.r_mediane, d.echec,$b$,
    $a$'essai_max', essai_max, 'r', r_mediane, 'prevu_le', prevu_le)$a$, $b$'essai_max', essai_max, 'r', r_mediane, 'prevu_le', prevu_le, 'echec', echec)$b$
  ];
  i integer;
begin
  for i in 1 .. 2 loop
    if (length(d) - length(replace(d, paires[2 * i - 1], ''))) / length(paires[2 * i - 1]) <> 1 then
      raise exception '0698 : bloc % introuvable dans sources_file(), rien n''est changé', i;
    end if;
    d := replace(d, paires[2 * i - 1], paires[2 * i]);
  end loop;
  execute d;
end;
$patch$;
