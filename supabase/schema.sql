-- ═══════════════════════════════════════════════════════════════
--  ORBITE — schéma Supabase
--  À coller dans : Supabase > SQL Editor > New query > Run
--  Tables préfixées lm_ : aucune collision avec ZATHLETE ou autre.
--  Ré-exécutable sans risque (IF NOT EXISTS / OR REPLACE).
-- ═══════════════════════════════════════════════════════════════

-- 1) Entités (maps, projets, tâches, notes, objectifs, jalons…)
create table if not exists public.lm_entities (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null,
  title       text not null default '',
  map_id      uuid,
  parent_id   uuid,
  deleted     boolean not null default false,
  updated_at  timestamptz not null,          -- horodatage client (last-write-wins)
  synced_at   timestamptz not null default now(), -- horodatage serveur (curseur de synchro)
  doc         jsonb not null                 -- objet complet (évolutif sans migration)
);

-- 2) Connexions entre éléments (lié à, dépend de, mène à, référence…)
create table if not exists public.lm_edges (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  map_id      uuid,
  deleted     boolean not null default false,
  updated_at  timestamptz not null,
  synced_at   timestamptz not null default now(),
  doc         jsonb not null
);

-- 3) Réglages (thème, priorités, statuts, 3 priorités du jour…)
create table if not exists public.lm_kv (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null,
  doc         jsonb not null,
  updated_at  timestamptz not null,
  synced_at   timestamptz not null default now(),
  primary key (user_id, key)
);

-- Index pour la synchro incrémentale
create index if not exists lm_entities_user_synced on public.lm_entities (user_id, synced_at);
create index if not exists lm_entities_user_type   on public.lm_entities (user_id, type);
create index if not exists lm_edges_user_synced    on public.lm_edges (user_id, synced_at);

-- synced_at = now() à chaque écriture (insert ou update)
create or replace function public.lm_touch_synced_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.synced_at := now();
  return new;
end $$;

drop trigger if exists lm_entities_touch on public.lm_entities;
create trigger lm_entities_touch before insert or update on public.lm_entities
  for each row execute function public.lm_touch_synced_at();

drop trigger if exists lm_edges_touch on public.lm_edges;
create trigger lm_edges_touch before insert or update on public.lm_edges
  for each row execute function public.lm_touch_synced_at();

drop trigger if exists lm_kv_touch on public.lm_kv;
create trigger lm_kv_touch before insert or update on public.lm_kv
  for each row execute function public.lm_touch_synced_at();

-- ── Sécurité : chaque compte ne voit QUE ses propres données ──
alter table public.lm_entities enable row level security;
alter table public.lm_edges    enable row level security;
alter table public.lm_kv       enable row level security;

drop policy if exists lm_entities_own on public.lm_entities;
create policy lm_entities_own on public.lm_entities
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists lm_edges_own on public.lm_edges;
create policy lm_edges_own on public.lm_edges
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists lm_kv_own on public.lm_kv;
create policy lm_kv_own on public.lm_kv
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Aucun accès anonyme
revoke all on public.lm_entities, public.lm_edges, public.lm_kv from anon;
grant select, insert, update, delete on public.lm_entities, public.lm_edges, public.lm_kv to authenticated;

-- Nettoyage optionnel (à lancer à la main de temps en temps) :
-- delete from public.lm_entities where deleted and synced_at < now() - interval '90 days';
-- delete from public.lm_edges    where deleted and synced_at < now() - interval '90 days';
