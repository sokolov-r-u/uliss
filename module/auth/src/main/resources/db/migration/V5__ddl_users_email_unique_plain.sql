-- The functional index on lower(email) is unusable for "email = ?" lookups; emails are stored lower case instead.
update auth.users
set email = lower(email)
where email <> lower(email);

drop index auth.users_email_unique;

alter table auth.users
    add constraint users_email_unique unique (email),
    add constraint users_email_lower_case check (email = lower(email));
