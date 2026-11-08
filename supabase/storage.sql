-- PO file storage (run after schema.sql). Creates a private bucket 'po-files'.
insert into storage.buckets(id,name,public) values('po-files','po-files',false) on conflict do nothing;
create policy po_read on storage.objects for select using (bucket_id='po-files' and public.signed_in());
create policy po_write on storage.objects for insert with check (bucket_id='po-files' and public.can_edit());
