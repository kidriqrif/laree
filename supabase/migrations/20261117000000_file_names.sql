-- An activity file's name may not hold two dots in a row. The backup refuses such names
-- (scripts/backup.sh), and ".." on its own is the parent folder on disk. The upload rules of
-- 20261115000000_init.sql allowed them, so one upload could keep every backup from finishing.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'activity_files_add') then
    execute $p$
      alter policy activity_files_add on storage.objects with check (
        bucket_id = 'activity-files' and (storage.foldername(name))[1] = (select auth.uid())::text
        -- {athlete id}/{file name}, nothing else: the backup and restore scripts rely on this shape.
        and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$' and name !~ '\.\.'
      )$p$;
    execute $p$
      alter policy activity_files_replace on storage.objects using (
        bucket_id = 'activity-files' and (storage.foldername(name))[1] = (select auth.uid())::text
      ) with check (
        bucket_id = 'activity-files' and (storage.foldername(name))[1] = (select auth.uid())::text
        and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$' and name !~ '\.\.'
      )$p$;
  end if;
end $$;
