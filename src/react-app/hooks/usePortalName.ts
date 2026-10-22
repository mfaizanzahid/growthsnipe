import { useEffect, useState } from "react";

export interface PortalInfo {
  name: string;
  supportEmail: string;
}

/** Portal display name + support address from server settings, with static fallbacks. */
export function usePortal(fallbackName = "GrowthSnipe"): PortalInfo {
  const [info, setInfo] = useState<PortalInfo>({ name: fallbackName, supportEmail: "" });
  useEffect(() => {
    fetch("/api/portal")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const data = d as { portal_name?: string; support_email?: string } | null;
        if (!data) return;
        setInfo({
          name: data.portal_name || fallbackName,
          supportEmail: data.support_email || "",
        });
      })
      .catch(() => undefined);
  }, [fallbackName]);
  return info;
}

/** Portal display name from server settings, with a static fallback. */
export function usePortalName(fallback = "GrowthSnipe"): string {
  return usePortal(fallback).name;
}
