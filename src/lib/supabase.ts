// Demo build: no Supabase.
//
// The original app uses @supabase/supabase-js (Postgres + RLS, Auth,
// Storage, Edge Functions). In this copy the client is replaced by an
// in-memory backend with the same interface (see demo/mockClient): the
// rest of the code is unchanged and no network call is ever made.

import { createMockClient } from "./demo/mockClient";

export const supabase = createMockClient();
