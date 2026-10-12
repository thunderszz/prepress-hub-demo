-- 0011 — Advisor fix: fixed search_path on the storage helper
-- (function_search_path_mutable). The function only uses qualified
-- references (storage.foldername), so an empty search_path.
alter function app_private.storage_commessa_id(text) set search_path = '';
