-- One-shot : label ANCIENS + passer les contenus rejetés en valides.
-- Sert à marquer le stock pré-réimport pour purge ultérieure.

insert into public.labels (nom, slug, couleur)
values ('ANCIENS', 'anciens', '#8a6a3a')
on conflict (slug) do update set nom = excluded.nom, couleur = excluded.couleur;

update public.contenus
set statut = 'valide'
where statut = 'rejete';

insert into public.contenu_labels (contenu_id, label_id)
select c.id, l.id
from public.contenus c
cross join public.labels l
where l.slug = 'anciens'
on conflict do nothing;
