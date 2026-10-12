import { useCurrentUser } from "@/lib/store";
import { isFullAccess } from "@/lib/permissions";
import { DashboardProduzione } from "./dashboards/Produzione";
import { DashboardCommerciale } from "./dashboards/Commerciale";
import { DashboardAmministrazione } from "./dashboards/Amministrazione";
import { DashboardControlloQualita } from "./dashboards/ControlloQualita";
import { DashboardGrafico } from "./dashboards/Grafico";

export default function Dashboard() {
  const u = useCurrentUser();
  if (!u) return null;
  if (isFullAccess(u.ruolo)) return <DashboardProduzione />;
  switch (u.ruolo) {
    case "responsabile_commerciale": return <DashboardCommerciale />;
    case "amministrazione": return <DashboardAmministrazione />;
    case "controllo_qualita": return <DashboardControlloQualita />;
    case "grafico": return <DashboardGrafico />;
    default: return null;
  }
}
