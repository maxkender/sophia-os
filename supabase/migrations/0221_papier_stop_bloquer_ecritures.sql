-- Stop pipeline : un master arrêté n'accepte plus de plans / images / clips,
-- et un tick en vol ne peut plus le faire repartir tant que annule reste true.

create or replace function public.papier_refuser_ecriture_si_arrete()
returns trigger
language plpgsql
as $$
declare
  st text;
  ann boolean;
begin
  select m.statut, coalesce(m.annule, false) into st, ann
  from public.papier_masters m
  where m.id = coalesce(NEW.master_id, OLD.master_id);
  if not found then
    return NEW;
  end if;
  if ann or st = 'stopped' then
    raise exception 'pipeline papier arrêtée';
  end if;
  return NEW;
end;
$$;

drop trigger if exists papier_scenes_stop on public.papier_scenes;
create trigger papier_scenes_stop
  before insert or update on public.papier_scenes
  for each row execute function public.papier_refuser_ecriture_si_arrete();

create or replace function public.papier_garder_arret()
returns trigger
language plpgsql
as $$
begin
  if (old.annule or old.statut = 'stopped')
     and new.annule
     and new.statut not in ('stopped', 'ready') then
    new.statut := 'stopped';
    new.etape := 'stopped';
    new.annule := true;
    new.busy := false;
    new.pipeline_hold := null;
  end if;
  return new;
end;
$$;

drop trigger if exists papier_masters_garder_arret on public.papier_masters;
create trigger papier_masters_garder_arret
  before update on public.papier_masters
  for each row execute function public.papier_garder_arret();
