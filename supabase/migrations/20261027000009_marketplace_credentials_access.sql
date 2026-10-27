-- Acesso controlado às credenciais e ao estado OAuth (schema private não é exposto pela API REST).
-- Todas as funções são SECURITY DEFINER e executáveis SOMENTE pelo service role: o servidor autoriza o usuário
-- antes de chamá-las. Os valores são sempre cifrados pela aplicação; o banco nunca vê tokens em claro.

alter table private.marketplace_credentials
  add column refresh_locked_until timestamptz;

create or replace function public.mp_store_credentials(
  p_account_id uuid, p_organization_id uuid, p_access text, p_refresh text, p_expires_at timestamptz, p_key_version integer
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into private.marketplace_credentials as c
    (marketplace_account_id, organization_id, encrypted_access_token, encrypted_refresh_token, expires_at, encryption_key_version, token_generation, refreshed_at, updated_at)
  values (p_account_id, p_organization_id, p_access, p_refresh, p_expires_at, p_key_version, 1, now(), now())
  on conflict (marketplace_account_id) do update
    set encrypted_access_token = excluded.encrypted_access_token,
        encrypted_refresh_token = excluded.encrypted_refresh_token,
        expires_at = excluded.expires_at,
        encryption_key_version = excluded.encryption_key_version,
        token_generation = c.token_generation + 1,
        refreshed_at = now(),
        updated_at = now(),
        refresh_locked_until = null
    where c.organization_id = excluded.organization_id
  returning token_generation;
$$;

create or replace function public.mp_get_credentials(p_account_id uuid)
returns table (
  organization_id uuid, encrypted_access_token text, encrypted_refresh_token text, expires_at timestamptz,
  encryption_key_version integer, token_generation bigint, refresh_locked_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id, encrypted_access_token, encrypted_refresh_token, expires_at, encryption_key_version, token_generation, refresh_locked_until
  from private.marketplace_credentials where marketplace_account_id = p_account_id;
$$;

-- Lease de renovação: só um processo renova por vez; só obtém se a geração ainda for a lida.
create or replace function public.mp_claim_refresh(p_account_id uuid, p_generation bigint, p_lease_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.marketplace_credentials
  set refresh_locked_until = now() + make_interval(secs => p_lease_seconds)
  where marketplace_account_id = p_account_id
    and token_generation = p_generation
    and (refresh_locked_until is null or refresh_locked_until < now());
  return found;
end;
$$;

-- Compare-and-swap: grava os novos tokens apenas se ninguém renovou antes.
create or replace function public.mp_complete_refresh(
  p_account_id uuid, p_expected_generation bigint, p_access text, p_refresh text, p_expires_at timestamptz, p_key_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.marketplace_credentials
  set encrypted_access_token = p_access,
      encrypted_refresh_token = p_refresh,
      expires_at = p_expires_at,
      encryption_key_version = p_key_version,
      token_generation = token_generation + 1,
      refreshed_at = now(),
      updated_at = now(),
      refresh_locked_until = null
  where marketplace_account_id = p_account_id and token_generation = p_expected_generation;
  return found;
end;
$$;

create or replace function public.mp_release_refresh(p_account_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.marketplace_credentials set refresh_locked_until = null where marketplace_account_id = p_account_id;
$$;

create or replace function public.mp_delete_credentials(p_account_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.marketplace_credentials where marketplace_account_id = p_account_id;
$$;

create or replace function public.oauth_state_create(
  p_state_hash text, p_organization_id uuid, p_user_id uuid, p_marketplace text, p_verifier text, p_key_version integer, p_ttl_seconds integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.oauth_states where expires_at < now() - interval '1 day';
  insert into private.oauth_states (state_hash, organization_id, user_id, marketplace, encrypted_code_verifier, encryption_key_version, expires_at)
  values (p_state_hash, p_organization_id, p_user_id, p_marketplace, p_verifier, p_key_version, now() + make_interval(secs => p_ttl_seconds));
$$;

-- Consome o estado uma única vez, somente pelo mesmo usuário e antes de expirar.
create or replace function public.oauth_state_consume(p_state_hash text, p_user_id uuid)
returns table (organization_id uuid, marketplace text, encrypted_code_verifier text, encryption_key_version integer)
language sql
security definer
set search_path = ''
as $$
  update private.oauth_states
  set consumed_at = now()
  where state_hash = p_state_hash and user_id = p_user_id and consumed_at is null and expires_at > now()
  returning organization_id, marketplace, encrypted_code_verifier, encryption_key_version;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.mp_store_credentials(uuid, uuid, text, text, timestamptz, integer)',
    'public.mp_get_credentials(uuid)',
    'public.mp_claim_refresh(uuid, bigint, integer)',
    'public.mp_complete_refresh(uuid, bigint, text, text, timestamptz, integer)',
    'public.mp_release_refresh(uuid)',
    'public.mp_delete_credentials(uuid)',
    'public.oauth_state_create(text, uuid, uuid, text, text, integer, integer)',
    'public.oauth_state_consume(text, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
