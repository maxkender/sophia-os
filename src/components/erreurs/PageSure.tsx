import { Outlet, useLocation } from "react-router-dom";

import { SectionSure } from "./SectionSure";

/** 6/11 : la page courante dans une SectionSure, remise à zéro à chaque navigation (plus de page blanche). */
export function PageSure() {
  const { pathname } = useLocation();
  return (
    <SectionSure key={pathname} nom={pathname}>
      <Outlet />
    </SectionSure>
  );
}
