import { useEffect, useState } from "react";

/** Portal name heading for auth pages (loaded live from settings). Blank until loaded. */
export function PortalHeading() {
  const [portalName, setPortalName] = useState("GrowthSnipe");

  useEffect(() => {
    fetch("/api/portal")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const name = (d as { portal_name?: string } | null)?.portal_name;
        if (name) setPortalName(name);
      })
      .catch(() => undefined);
  }, []);

  return (
    <h1 className="min-h-9 text-center text-3xl font-bold tracking-tight text-primary">
      {portalName || "GrowthSnipe"}
    </h1>
  );
}
