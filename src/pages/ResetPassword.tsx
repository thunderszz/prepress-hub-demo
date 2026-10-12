import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLockup, HalftoneField, BrandStripe } from "@/components/BrandLogo";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast({ title: "Password updated" });
      navigate("/login", { replace: true });
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Invalid or expired link.",
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
            <h1 className="mb-1">New password</h1>
            <p className="mb-6 text-[13px] text-muted-foreground">
              Set a new password for your account.
            </p>

            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground" htmlFor="confirm-password">
                  Confirm password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save password
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
