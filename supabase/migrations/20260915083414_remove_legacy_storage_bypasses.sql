-- Remove legacy development bypasses; retain existing scoped document/logo policies.
-- Object contents, bucket visibility and service access are unchanged.
drop policy if exists "Authenticated company logo delete 1y3lpeg_0" on storage.objects;
drop policy if exists "Authenticated company logo delete 1y3lpeg_1" on storage.objects;
drop policy if exists "Authenticated company logo select 1y3lpeg_0" on storage.objects;
drop policy if exists "Authenticated company logo update 1y3lpeg_0" on storage.objects;
drop policy if exists "Authenticated company logo update 1y3lpeg_1" on storage.objects;
drop policy if exists "Authenticated company logo upload 1y3lpeg_0" on storage.objects;
drop policy if exists "Authenticated users can delete company logos" on storage.objects;
drop policy if exists "Authenticated users can update company logos" on storage.objects;
drop policy if exists "Authenticated users can upload company logos" on storage.objects;
drop policy if exists "Authenticated users can view company logos" on storage.objects;
drop policy if exists "delivery_notes_dev_insert_anon" on storage.objects;
drop policy if exists "delivery_notes_dev_select_anon" on storage.objects;
drop policy if exists "merchant_documents_insert_by_company" on storage.objects;
notify pgrst, 'reload schema';
