-- Hosted projects may add this event trigger outside the application migrations.
-- It must run for database DDL, but application clients never need to call it.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
    if has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') then
      raise exception 'Internal automatic RLS helper is still client-executable.';
    end if;
  end if;
end;
$$;
