-- 0721 : pas d'essai de 30 posts pour une source qui arrive dans un label neuf.
--
-- Décision d'Adrien du 14/11. L'essai (0686) n'importe d'abord que les 30
-- meilleurs posts d'une source neuve, et ne lève le plafond que si la source
-- « tient » sur nos comptes : 10 posts mesurés chez nous, jugés le lundi. Dans
-- un label que personne ne porte encore (aucun compte rattaché), ses posts ne
-- sont jamais publiés, donc jamais mesurés : l'essai n'est jamais jugé et la
-- source reste à 30 posts pour toujours (cas de `psychologiefaits`, @don.loq
-- et @lena.psychologie, le 14/11).
--
-- Désormais, `maj_sources_ajouter` ne met une source en essai que si l'un de
-- ses labels est déjà porté par au moins un compte (`compte_labels`). Sinon,
-- elle s'importe comme une mise à jour normale : ses 100 posts les plus vus
-- d'abord (`posts_max_par_maj`), puis le reste à chaque mise à jour du lundi
-- (règle A11 de 0667 : une source avec moins de 5 posts mesurés chez nous est
-- toujours retenue, « neuve »). Les deux chemins d'ajout (formulaire de la page
-- Sources, validation d'un candidat) posent les labels de la source avant
-- d'appeler `maj_sources_ajouter` : le test les voit.
--
-- Retour arrière : réappliquer la définition de 0686.
-- ✅ Appliquée le 2026-11-14 (MCP). Idempotente : refuse de s'appliquer si le
-- bloc attendu n'est pas trouvé exactement une fois.

create or replace function pg_temp.sources_patcher(p_fn regprocedure, p_paires text[])
returns void
language plpgsql
as $function$
declare
  d text;
  i integer;
  n integer;
begin
  d := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_paires, 1) / 2 loop
    n := (length(d) - length(replace(d, p_paires[2 * i - 1], ''))) / length(p_paires[2 * i - 1]);
    if n <> 1 then
      raise exception '0721 : % : bloc % trouvé % fois (attendu 1), rien n''est changé', p_fn, i, n;
    end if;
    d := replace(d, p_paires[2 * i - 1], p_paires[2 * i]);
  end loop;
  execute d;
end;
$function$;

select pg_temp.sources_patcher(
  'public.maj_sources_ajouter(uuid)'::regprocedure,
  array[
    $old$     and not exists (select 1 from contenus c where c.compte_reference_id = p_compte);$old$,
    $new$     and not exists (select 1 from contenus c where c.compte_reference_id = p_compte)
     -- 0721 : et seulement dans un label déjà porté par des comptes. Dans un
     -- label neuf, l'essai ne serait jamais jugé : la source s'importe normalement.
     and exists (select 1 from compte_reference_labels crl
                   join compte_labels cl on cl.label_id = crl.label_id
                  where crl.compte_reference_id = p_compte);$new$
  ]
);

comment on function public.maj_sources_ajouter(uuid) is
  'Sources (0669, 0686, 0721) : une source ajoutée passe par la file. Neuve et dans un label déjà porté par des comptes, elle est mise en essai (ses meilleurs posts d''abord) ; dans un label neuf, elle s''importe normalement (100 posts au plus par mise à jour). Lancée tout de suite si rien ne tourne et que le quota de sources neuves du jour n''est pas pris, sinon elle attend. Rend {file: lancee | attente, essai_max, prevu_le}.';
