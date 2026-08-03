create table if not exists profile.messages
(
    id         uuid primary key,
    code       varchar(50) not null unique,
    blocking   boolean default false,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table if not exists profile.user_message
(
    user_id    uuid        not null,
    message_id uuid        not null,
    status     varchar(15) not null default 'PENDING',
    created_at timestamptz not null,
    updated_at timestamptz not null,
    primary key (user_id, message_id),
    foreign key (user_id) references profile.users (id),
    foreign key (message_id) references profile.messages (id)
);



