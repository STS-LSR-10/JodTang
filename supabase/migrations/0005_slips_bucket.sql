-- Phase 4: private Storage bucket for slip / receipt images.
-- Idempotent. The bucket is private and has no policies: only the service role (server)
-- can read or write; users get short-lived signed URLs through our API.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'slips',
  'slips',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
