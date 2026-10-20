-- The seed left version null; Spring Data treats a loaded entity with a null version as new, so a save would INSERT.
update profile.messages set version = 0 where version is null;
update profile.user_message set version = 0 where version is null;
