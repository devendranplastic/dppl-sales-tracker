-- PO file storage (private bucket 'po-files'). Safe to re-run.
insert into storage.buckets(id,name,public) values('po-files','po-files',false) on conflict (id) do nothing;
drop policy if exists po_read on storage.objects;
drop policy if exists po_write on storage.objects;
create policy po_read on storage.objects for select to authenticated using (bucket_id='po-files' and public.signed_in());
create policy po_write on storage.objects for insert to authenticated with check (bucket_id='po-files' and public.can_edit());
