import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Commesse from "./pages/Commesse";
import CommessaDetail from "./pages/CommessaDetail";
import Clienti from "./pages/Clienti";
import ClienteDetail from "./pages/ClienteDetail";
import Profilo from "./pages/Profilo";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound.tsx";
import { lazy, Suspense, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { loadAppData, subscribeToRealtime } from "@/lib/supabaseData";
import { useSessionStore } from "@/lib/store";

// Settings is the largest page and the least visited: load it on demand.
const Configurazione = lazy(() => import("./pages/Configurazione"));

const App = () => (
  <>
    <Toaster />
    <SupabaseBootstrap />
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/logout" element={<Logout />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<Commesse />} />
          <Route path="/jobs/:id" element={<CommessaDetail />} />
          <Route path="/customers" element={<Clienti />} />
          <Route path="/customers/:id" element={<ClienteDetail />} />
          <Route
            path="/settings"
            element={
              <Suspense fallback={null}>
                <Configurazione />
              </Suspense>
            }
          />
          <Route path="/profile" element={<Profilo />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </>
);

export default App;

function SupabaseBootstrap() {
  const setHasHydrated = useSessionStore((s) => s.setHasHydrated);
  const logout = useSessionStore((s) => s.logout);

  useEffect(() => {
    let unsubscribeRealtime: (() => void) | null = null;

    const stopRealtime = () => {
      unsubscribeRealtime?.();
      unsubscribeRealtime = null;
    };

    // onAuthStateChange emits INITIAL_SESSION on mount: it is the ONLY
    // hydration source. No parallel getSession(), so data is not loaded
    // twice and no Realtime channel is left dangling.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        stopRealtime();
        logout();
        setHasHydrated(true);
        return;
      }

      // TOKEN_REFRESHED fires ~every hour: data and Realtime are already
      // active, no need to reload everything.
      if (event === "TOKEN_REFRESHED" && unsubscribeRealtime) {
        return;
      }

      void loadAppData()
        .then(() => {
          stopRealtime();
          unsubscribeRealtime = subscribeToRealtime();
        })
        .catch((error) => {
          console.error("Backend bootstrap error", error);
          logout();
          setHasHydrated(true);
        });
    });

    return () => {
      subscription.unsubscribe();
      stopRealtime();
    };
  }, [logout, setHasHydrated]);

  return null;
}
