import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../components/billing/shared";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";

export function AdminSettings() {
  const allowed = useAdminGuard();
  const [settings, setSettings] = useState({ support_email: "" });
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const s = await api("/api/superadmin/settings");
      const raw = (s as { settings?: Record<string, string> }).settings ?? {};
      setSettings({ support_email: raw.support_email ?? "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Support email shown in every email.</p>
      </div>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Support settings</CardTitle>
          <CardDescription>Shown in every email. The portal name is fixed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Support email</Label>
            <Input value={settings.support_email} onChange={(e) => setSettings({ ...settings, support_email: e.target.value })} />
          </div>
          <Button
            onClick={async () => {
              try {
                await api("/api/superadmin/settings", { method: "PATCH", body: JSON.stringify(settings) });
                toast.success("Settings saved");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              }
            }}
          >
            Save settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
