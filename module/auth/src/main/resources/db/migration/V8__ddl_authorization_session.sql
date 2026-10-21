-- The browser session (OIDC sid) each authorization was signed in through; end-session revokes all of them.
CREATE TABLE auth.authorization_session
(
    authorization_id varchar(100) PRIMARY KEY REFERENCES auth.oauth2_authorization (id) ON DELETE CASCADE,
    session_id       varchar(255) NOT NULL
);

CREATE INDEX idx_authorization_session_session_id ON auth.authorization_session (session_id);
