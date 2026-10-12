import { FormEvent, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCurrentUser, useSessionStore } from "@/lib/store";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import { loadAppData } from "@/lib/supabaseData";
import { sendPasswordReset } from "@/lib/configurationActions";
import { toast } from "@/hooks/use-toast";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo/seed";
import { ROLE_LABELS } from "@/lib/types";
import { BrandLockup, HalftoneField, BrandStripe } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const currentUser = useCurrentUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const from = useMemo(
    () => (location.state as { from?: string } | null)?.from ?? "/",
    [location.state],
  );

  if (hasHydrated && isAuthenticated && currentUser) return <Navigate to={from} replace />;

  const submit = async (event?: FormEvent, override?: { email: string; password: string }) => {
    event?.preventDefault();
    const creds = override ?? { email, password };
    if (!hasSupabaseConfig) {
      toast({
        title: "Backend not configured",
        description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the local .env file.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: creds.email.trim(),
        password: creds.password,
      });
      if (error) throw error;

      const appUser = await loadAppData();
      if (!appUser) {
        await supabase.auth.signOut();
        toast({
          title: "User not enabled",
          description: "This sign-in email does not match an active user.",
          variant: "destructive",
        });
        return;
      }

      navigate(from, { replace: true });
    } catch (error) {
      toast({
        title: "Sign-in failed",
        description: error instanceof Error ? error.message : "Invalid credentials.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen grid place-items-center overflow-hidden bg-background p-6">
      <HalftoneField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" />

      <div className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <BrandStripe />
        <div className="grid md:grid-cols-2">
          <div className="relative hidden flex-col items-center justify-center gap-6 overflow-hidden border-r border-border bg-gradient-to-br from-white to-accent/40 p-10 md:flex">
            <HalftoneField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]" />
            <BrandLockup className="relative" />
            <div className="relative text-center">
              <div className="text-[13px] font-semibold text-foreground">
                Flexographic prepress
              </div>
              <div className="text-[12px] text-muted-foreground">
                Demo project · sample data
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-10">
            <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.18em] text-primary">
              Prepress Hub
            </div>
            <h1 className="mb-1">Sign in</h1>
            <p className="mb-6 text-[13px] text-muted-foreground">
              Demo version with sample data. Pick a profile below, or sign in with any demo email (password <code className="rounded bg-muted px-1">demo</code>).
            </p>

            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="giulia.ferri@acmeflexo.example"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>

            <div className="mt-6 border-t border-border pt-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Quick demo access
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {DEMO_USERS.filter((u) => u.ruolo !== "grafico" || u.email.startsWith("luca.")).map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setEmail(u.email);
                      setPassword(DEMO_PASSWORD);
                      void submit(undefined, { email: u.email, password: DEMO_PASSWORD });
                    }}
                    className="rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:opacity-50"
                  >
                    <div className="text-[13px] font-medium text-foreground">{u.nome}</div>
                    <div className="text-[11px] text-muted-foreground">{ROLE_LABELS[u.ruolo]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  const cleanEmail = email.trim();
                  if (!cleanEmail) {
                    toast({ title: "Enter your email", variant: "destructive" });
                    return;
                  }
                  void sendPasswordReset(cleanEmail).then((res) => {
                    if (res.ok === false) {
                      toast({ title: "Password reset not sent", description: res.reason, variant: "destructive" });
                      return;
                    }
                    toast({ title: "Password reset email sent", description: cleanEmail });
                  });
                }}
                className="text-[12px] text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
