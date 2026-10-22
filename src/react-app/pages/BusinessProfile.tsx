import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/sidekick";
import { BusinessProfileForm, EMPTY_PROFILE, type BusinessProfileValues } from "../components/BusinessProfileForm";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

/** Business profile: feeds briefings, snapshots, and served MCP instructions. */
export function BusinessProfile() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const orgId = activeOrg?.id ?? null;
  const [profile, setProfile] = useState<BusinessProfileValues>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<{ profile: Record<string, string | null> | null }>(`/api/sidekick/business-profile?orgId=${orgId}`)
      .then((d) => {
        if (d.profile) {
          setProfile({
            businessName: d.profile.businessName ?? "",
            trade: d.profile.trade ?? "",
            serviceArea: d.profile.serviceArea ?? "",
            ownerName: d.profile.ownerName ?? "",
            teamSize: d.profile.teamSize ?? "",
            servicesMain: d.profile.servicesMain ?? "",
            servicesHighValue: d.profile.servicesHighValue ?? "",
            servicesRecurring: d.profile.servicesRecurring ?? "",
          });
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load business profile"))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      await api("/api/sidekick/business-profile", {
        method: "PUT",
        body: JSON.stringify({ orgId, ...profile }),
      });
      toast.success("Business profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save business profile");
    } finally {
      setSaving(false);
    }
  }

  if (!orgId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>Select a workspace to see its profile.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Business profile</h1>
        <p className="text-sm text-muted-foreground">How your business appears across briefings, snapshots, and AI answers for {activeOrg?.name}.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>Business name and trade are required.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></div>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <BusinessProfileForm value={profile} onChange={setProfile} idPrefix="bp" />
              <Button type="submit" disabled={saving || !profile.businessName.trim() || !profile.trade.trim()}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
