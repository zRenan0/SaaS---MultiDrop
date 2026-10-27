-- Limitação de requisições em rotas sensíveis (janela fixa), persistida no banco para funcionar em serverless.

create table private.rate_limit_buckets (
  bucket_key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket_key, window_start)
);
revoke all on private.rate_limit_buckets from public, anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  current_hits integer;
begin
  insert into private.rate_limit_buckets (bucket_key, window_start, hits)
  values (left(p_key, 200), win, 1)
  on conflict (bucket_key, window_start) do update set hits = private.rate_limit_buckets.hits + 1
  returning hits into current_hits;

  -- Limpeza oportunista de janelas antigas.
  if random() < 0.01 then
    delete from private.rate_limit_buckets where window_start < now() - interval '1 day';
  end if;

  return current_hits <= p_limit;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
