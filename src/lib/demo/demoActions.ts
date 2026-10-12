// Portfolio demo actions: switch user on the fly and reset the data.

import { supabase } from "../supabase";
import { loadAppData } from "../supabaseData";
import { resetDemoData } from "./mockClient";
import { DEMO_PASSWORD } from "./seed";

/** Sign in as another demo user (to see each role's permissions and dashboard). */
export async function switchDemoUser(email: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) return false;
  return (await loadAppData()) !== null;
}

/** Resets customers, jobs and history to the initial state. */
export async function resetDemo(): Promise<void> {
  resetDemoData();
  await loadAppData();
}
