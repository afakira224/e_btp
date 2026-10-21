import { Outlet } from "react-router-dom";
import { AnnouncementBar, SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { ScrollToTop } from "./ScrollToTop";

// ─────────────────────────────────────────────
//  Ossature commune aux pages publiques.
//  Le bandeau, l'en-tête et le pied de page sont montés une fois pour
//  toutes : en naviguant d'une page à l'autre, ils ne sont ni démontés ni
//  reconstruits, et le menu « Domaine » ne recharge pas ses familles.
// ─────────────────────────────────────────────
export const SiteLayout = () => (
  <>
    <ScrollToTop />
    <AnnouncementBar />
    <SiteHeader />
    <main>
      <Outlet />
    </main>
    <SiteFooter />
  </>
);
