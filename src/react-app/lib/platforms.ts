/**
 * Provider catalog for the connections UI. Mirrors the server's provider keys
 * (`src/server/providers/types.ts`); `status` drives selectability.
 * Coming-soon platforms render disabled with a "Coming soon" badge and can
 * never be submitted (the server also rejects them with 422).
 */
export interface PlatformOption {
  key: string;
  label: string;
  status: "live" | "coming-soon";
}

export const PLATFORM_OPTIONS: PlatformOption[] = [
  { key: "spectora", label: "Spectora", status: "live" },
  { key: "isn", label: "ISN", status: "live" },
  { key: "servicetitan", label: "ServiceTitan", status: "coming-soon" },
  { key: "housecallpro", label: "Housecall Pro", status: "coming-soon" },
  { key: "jobber", label: "Jobber", status: "coming-soon" },
];

export const COMING_SOON_PLATFORMS = PLATFORM_OPTIONS.filter((p) => p.status === "coming-soon");
