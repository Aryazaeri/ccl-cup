-- Run against an isolated local Supabase database as postgres. All fixtures roll back.
begin;
insert into seasons(name,slug,year,city,status) values('Security draft fixture','security-draft-fixture',2026,'Antalya','draft');
insert into auth.users(id, raw_user_meta_data) values
 ('ee000000-0000-0000-0000-000000000001','{"full_name":"Security test super one"}'),
 ('ee000000-0000-0000-0000-000000000002','{"full_name":"Security test super two"}'),
 ('ee000000-0000-0000-0000-000000000003','{"full_name":"Security test admin"}'),
 ('ee000000-0000-0000-0000-000000000004','{"full_name":"Security test viewer"}');
update profiles set role='super_admin' where id in ('ee000000-0000-0000-0000-000000000001','ee000000-0000-0000-0000-000000000002');
update profiles set role='admin' where id='ee000000-0000-0000-0000-000000000003';

set local role authenticated;
set local request.jwt.claims='{"sub":"ee000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin
  begin update profiles set role='super_admin' where id=auth.uid(); raise exception 'FAIL: own role update allowed';
  exception when insufficient_privilege then null; end;
  begin delete from profiles where id=auth.uid(); raise exception 'FAIL: profile delete allowed';
  exception when insufficient_privilege then null; end;
  begin perform set_user_role(auth.uid(),'super_admin'); raise exception 'FAIL: viewer role RPC allowed';
  exception when insufficient_privilege then null; end;
  update profiles set full_name='Legitimate name edit' where id=auth.uid();
  if not exists(select 1 from profiles where id=auth.uid() and full_name='Legitimate name edit' and role='viewer') then
    raise exception 'FAIL: legitimate name update';
  end if;
end $$;
set local request.jwt.claims='{"sub":"ee000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  begin perform set_user_role('ee000000-0000-0000-0000-000000000001','viewer'); raise exception 'FAIL: admin demoted super';
  exception when insufficient_privilege then null; end;
  begin perform set_user_role('ee000000-0000-0000-0000-000000000004','super_admin'); raise exception 'FAIL: admin granted super';
  exception when insufficient_privilege then null; end;
  perform set_user_role('ee000000-0000-0000-0000-000000000004','editor');
  if not exists(select 1 from profiles where id='ee000000-0000-0000-0000-000000000004' and role='editor') then
    raise exception 'FAIL: legitimate admin role change';
  end if;
end $$;
set local request.jwt.claims='{"sub":"ee000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin
  if not public.can_manage_asset('articles/staged.png') then raise exception 'FAIL: editor staged preview'; end if;
  if public.can_manage_asset('players/person.png') then raise exception 'FAIL: editor player write'; end if;
  if public.can_manage_asset('other/file.png') then raise exception 'FAIL: unknown folder'; end if;
  if public.is_public_asset('articles/staged.png') then raise exception 'FAIL: unreferenced draft public'; end if;
  if not exists(select 1 from seasons where status='draft') then raise exception 'FAIL: editor draft standings'; end if;
  begin insert into seasons(name,slug,year,city) values('Forbidden','security-forbidden',2026,'Antalya');
    raise exception 'FAIL: editor competition write'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Existing synthetic supers are included so this checks the actual final-super boundary.
set local request.jwt.claims='{}';
update profiles set role='viewer' where role='super_admin' and id<>'ee000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims='{"sub":"ee000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  begin perform set_user_role(auth.uid(),'admin'); raise exception 'FAIL: last super demoted';
  exception when check_violation then null; end;
end $$;
reset role;
set local request.jwt.claims='{}';
do $$ begin
  begin delete from auth.users where id='ee000000-0000-0000-0000-000000000001'; raise exception 'FAIL: last super account deleted';
  exception when check_violation then null; end;
  if (select public from storage.buckets where id='club-assets') then raise exception 'FAIL: public bucket'; end if;
end $$;
rollback;
select 'role and private-asset security regression checks passed' as result;
