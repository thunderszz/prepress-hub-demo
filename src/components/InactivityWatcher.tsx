import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSessionStore, INACTIVITY } from "@/lib/store";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export function InactivityWatcher() {
  const navigate = useNavigate();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const warningOpen = useSessionStore((s) => s.warningOpen);
  const touchActivity = useSessionStore((s) => s.touchActivity);
  const showInactivityWarning = useSessionStore((s) => s.showInactivityWarning);
  const hideInactivityWarning = useSessionStore((s) => s.hideInactivityWarning);
  const logout = useSessionStore((s) => s.logout);
  const logoutTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = () => {
      if (!useSessionStore.getState().warningOpen) touchActivity();
    };
    const events: (keyof WindowEventMap)[] = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [isAuthenticated, touchActivity]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - useSessionStore.getState().lastActivity;
      if (elapsed >= INACTIVITY.LIMIT_MS && !useSessionStore.getState().warningOpen) {
        showInactivityWarning();
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [isAuthenticated, showInactivityWarning]);

  useEffect(() => {
    if (warningOpen) {
      logoutTimer.current = window.setTimeout(() => {
        void supabase.auth.signOut().finally(logout);
        navigate("/login");
      }, INACTIVITY.WARNING_MS);
    }
    return () => {
      if (logoutTimer.current) window.clearTimeout(logoutTimer.current);
    };
  }, [warningOpen, logout, navigate]);

  return (
    <Dialog open={warningOpen} onOpenChange={(o) => !o && hideInactivityWarning()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Session about to expire</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          You will be signed out in 2 minutes due to inactivity. Do you want to stay signed in?
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              void supabase.auth.signOut().finally(logout);
              navigate("/login");
            }}
          >
            Sign out
          </Button>
          <Button onClick={hideInactivityWarning}>Stay signed in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
