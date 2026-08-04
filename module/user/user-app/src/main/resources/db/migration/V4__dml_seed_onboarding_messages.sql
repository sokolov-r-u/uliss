insert into profile.messages (id, code, blocking, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000001', 'SET_DISPLAY_NAME', true, now(), now()),
       ('00000000-0000-0000-0000-000000000002', 'COMPLETE_PROFILE', false, now(), now())
on conflict (code) do nothing;
