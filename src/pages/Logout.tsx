import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

export default function Logout() {
  const navigate = useNavigate();
  const logout = useSessionStore((s) => s.logout);
  useEffect(() => {
    void supabase.auth.signOut().finally(() => {
      logout();
      navigate("/login", { replace: true });
    });
  }, [logout, navigate]);
  return null;
}
