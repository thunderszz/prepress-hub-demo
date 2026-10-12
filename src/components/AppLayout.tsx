import { NavLink, Outlet, useLocation, useNavigate, Navigate, Link } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Settings,
  HelpCircle,
  User as UserIcon,
  LogOut,
  Search,
  Bell,
  AlertTriangle,
  FlaskConical,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSessionStore,
  useCurrentUser,
  useCommesseStore,
  useClientiStore,
} from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";
import { NAV_BY_ROLE, ROUTE_BY_NAV, NAV_LABELS, NavKey, canAccessRoute } from "@/lib/permissions";
import { useAllActiveAlerts, ALERT_LABELS } from "@/lib/alerts";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { InactivityWatcher } from "./InactivityWatcher";
import { BrandMark, HalftoneField } from "./BrandLogo";
import { supabase } from "@/lib/supabase";
import { DEMO_USERS } from "@/lib/demo/seed";
import { resetDemo, switchDemoUser } from "@/lib/demo/demoActions";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_ICONS: Record<NavKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  commesse: ClipboardList,
  clienti: Users,
  configurazione: Settings,
};

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/jobs": "Jobs",
  "/customers": "Customers",
  "/settings": "Settings",
  "/profile": "Profile",
};

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const currentUser = useCurrentUser();
  const activeUser = currentUser;

  if (!hasHydrated) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: pathname }} />;
  }

  if (!activeUser) {
    return <Navigate to="/login" replace state={{ from: pathname }} />;
  }

  if (!canAccessRoute(activeUser.ruolo, pathname)) {
    return <Navigate to="/" replace />;
  }

  let pageTitle = titles[pathname];
  if (!pageTitle) {
    if (pathname.startsWith("/jobs/")) pageTitle = "Job details";
    else if (pathname.startsWith("/customers/")) pageTitle = "Customer details";
    else if (pathname.startsWith("/settings/")) pageTitle = "Settings";
    else pageTitle = "Prepress Workflow";
  }

  const navKeys = NAV_BY_ROLE[activeUser.ruolo];

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="relative w-64 shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar flex flex-col">
        {/* Brand CMYK halftone: very faint, behind the content */}
        <HalftoneField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" />

        <div className="relative z-10 flex flex-1 flex-col min-h-0">
        <div className="px-5 py-4 border-b border-sidebar-border flex items-center gap-3">
          <BrandMark className="h-11 w-11" />
          <div className="min-w-0">
            <div className="text-[13px] font-bold tracking-wide text-primary leading-tight">
              PREPRESS HUB
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              Acme Flexo · Prepress
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navKeys.map((k) => {
            const Icon = NAV_ICONS[k];
            const to = ROUTE_BY_NAV[k];
            return (
              <NavLink
                key={k}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-muted",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {NAV_LABELS[k]}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-[12px] font-semibold text-foreground">
            {activeUser.iniziali}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">{activeUser.nome}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {ROLE_LABELS[activeUser.ruolo]}
            </div>
          </div>
        </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10 gap-4">
          <div className="text-[13px] text-muted-foreground shrink-0">
            <span className="font-medium text-foreground">Prepress Hub</span>
            <span className="mx-2">/</span>
            <span>{pageTitle}</span>
          </div>

          <div className="flex-1 max-w-xl">
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Portfolio demo: fictional data, switch role on the fly, reset. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning hover:bg-warning/20"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  DEMO · sample data
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  No real data, no backend: everything runs in your browser.
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>View the app as…</DropdownMenuLabel>
                {DEMO_USERS.filter((u) => u.ruolo !== "grafico" || u.email.startsWith("luca.")).map((u) => (
                  <DropdownMenuItem
                    key={u.email}
                    disabled={u.email === activeUser.email}
                    onClick={() => {
                      void switchDemoUser(u.email).then((ok) => {
                        if (!ok) return;
                        navigate("/");
                        toast({ title: `You are now ${u.nome}`, description: ROLE_LABELS[u.ruolo] });
                      });
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px]">{u.nome}</div>
                      <div className="text-[11px] text-muted-foreground">{ROLE_LABELS[u.ruolo]}</div>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    void resetDemo().then(() => {
                      navigate("/");
                      toast({ title: "Demo data reset" });
                    });
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" /> Reset demo data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationsBell />
            <button
              aria-label="Help"
              className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="User menu"
                  className="h-8 w-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-[12px] font-semibold"
                >
                  {activeUser.iniziali}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{activeUser.nome}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <UserIcon className="h-4 w-4 mr-2" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void supabase.auth.signOut();
                    navigate("/login");
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      <InactivityWatcher />
    </div>
  );
}

// ============================================================
// Global search (jobs)
// ============================================================
function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const commesse = useCommesseStore((s) => s.commesse);
  const clienti = useClientiStore((s) => s.clienti);
  const cliMap = useMemo(() => new Map(clienti.map((c) => [c.id, c])), [clienti]);

  const ql = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!ql) return [];
    return commesse
      .filter((c) => {
        const cli = cliMap.get(c.clienteId);
        return [
          c.numeroCommessa,
          c.nomeLavoro,
          c.stampatore,
          c.codStampatore,
          c.numeroOrdine,
          c.rifCliente,
          c.codArticolo,
          c.soggetto,
          c.codSoggetto,
          cli?.nome,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(ql));
      })
      .slice(0, 10);
  }, [ql, commesse, cliMap]);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        aria-label="Search jobs"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search jobs: number, customer, order, printer…"
        className="h-8 pl-8 text-[12px]"
      />
      {open && ql && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-y-auto z-50">
          {results.length === 0 ? (
            <div className="p-3 text-[12px] text-muted-foreground">No results.</div>
          ) : (
            <ul>
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted text-[12px] flex items-center justify-between gap-2"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      navigate(`/jobs/${c.id}`);
                      setQ("");
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">
                      <span className="text-primary font-semibold">{c.numeroCommessa}</span>
                      <span className="text-muted-foreground"> • {cliMap.get(c.clienteId)?.nome}</span>
                      <span className="text-muted-foreground"> · {c.nomeLavoro}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Notification bell (active alerts)
// ============================================================
function NotificationsBell() {
  const alerts = useAllActiveAlerts();
  const commesse = useCommesseStore((s) => s.commesse);
  const clienti = useClientiStore((s) => s.clienti);
  const cliMap = useMemo(() => new Map(clienti.map((c) => [c.id, c])), [clienti]);
  const cMap = useMemo(() => new Map(commesse.map((c) => [c.id, c])), [commesse]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Notifications${alerts.length > 0 ? ` (${alerts.length} active)` : ""}`}
          className="relative h-8 w-8 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
        >
          <Bell className="h-4 w-4" />
          {alerts.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center tabular-nums">
              {alerts.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] max-h-[420px] overflow-y-auto p-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="label-caps">Active alerts</div>
          <span className="text-[11px] text-muted-foreground tabular-nums">{alerts.length}</span>
        </div>
        {alerts.length === 0 ? (
          <div className="p-4 text-[12px] text-muted-foreground">No active alerts.</div>
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a, i) => {
              const c = cMap.get(a.commessaId);
              const cli = c ? cliMap.get(c.clienteId) : null;
              return (
                <li key={i} className="px-4 py-2 text-[12px]">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-3.5 w-3.5 mt-0.5 shrink-0",
                      a.severity === "danger" ? "text-destructive" : "text-warning",
                    )} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
                          {a.code} — {ALERT_LABELS[a.code]}
                        </span>
                      </div>
                      {c && (
                        <Link to={`/jobs/${c.id}`} className="text-primary hover:underline font-medium">
                          {c.numeroCommessa}
                        </Link>
                      )}
                      {cli && <span className="text-muted-foreground"> • {cli.nome}</span>}
                      <div className="text-muted-foreground">{a.message}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
