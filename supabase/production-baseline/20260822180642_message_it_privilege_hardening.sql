-- Recovered verbatim from the live Nexusit_today Supabase migration history.
-- Production version: 20260822180642 / message_it_privilege_hardening

revoke all privileges on public.communication_identities from anon;
revoke all privileges on public.communication_identity_bindings from anon;
revoke all privileges on public.communication_conversations from anon;
revoke all privileges on public.communications from anon;
revoke all privileges on public.communication_participants from anon;
revoke all privileges on public.communication_events from anon;
revoke all privileges on public.communication_links from anon;
revoke all privileges on public.communication_notification_reads from anon;

revoke insert on public.communication_events from authenticated;
revoke update on public.communication_events from authenticated;
revoke delete on public.communication_events from authenticated;
revoke truncate on public.communication_events from authenticated;
revoke references on public.communication_events from authenticated;
revoke trigger on public.communication_events from authenticated;
