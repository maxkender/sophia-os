-- 0353 : plusieurs angles ACTIFS par label × application.
--
-- 0285 n'en permettait qu'un (index unique partiel), et activer un angle
-- repassait le précédent en test. Désormais une paire peut en avoir
-- plusieurs : le moteur en sert UN par contenu, toujours le même pour ce
-- contenu (dans toutes ses langues), et les contenus se répartissent à parts
-- égales entre les actifs (`choisirAngleActif`, _shared/angle_placement.ts).
-- Le deck d'une application garde l'id de l'angle servi
-- (`placement.angle_id`), Sophia son texte (`contenu_langues.angle_placement`).
--
-- Activer ou ajouter un angle actif ne touche plus aux autres ; « Repasser en
-- test » reste l'écriture directe de la page (RLS admin).
--
-- Aucune donnée n'est modifiée ni effacée.
-- Retour arrière : repasser en test tous les actifs d'une paire sauf un, puis
-- recréer l'index `angles_placement_un_actif` et les fonctions de 0285.

set lock_timeout = '5s';

drop index if exists public.angles_placement_un_actif;

create or replace function public.activer_angle_placement(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.angles_placement
     set statut = 'actif', updated_at = now()
   where id = p_id;
  -- Rien d'activé (droits, ligne disparue) : on le dit.
  if not found then
    raise exception 'angle % introuvable ou non modifiable', p_id;
  end if;
end;
$$;

create or replace function public.ajouter_angle_placement(
  p_label_id uuid,
  p_application_id uuid,
  p_texte text,
  p_actif boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.angles_placement (label_id, application_id, texte, statut)
  values (p_label_id, p_application_id, p_texte, case when p_actif then 'actif' else 'test' end)
  returning id into v_id;
  return v_id;
end;
$$;

comment on table public.angles_placement is
  'Angles de placement par label × application. actif (plusieurs par paire depuis 0353) = un par contenu, choisi de façon stable, ajouté au prompt de placement partout ; test = lu seulement par le test à blanc « contenus », une variante par angle. Voir supabase/functions/_shared/angle_placement.ts.';

reset lock_timeout;
