import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient, useSession } from "../lib/auth-client";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";

interface Member {
  id: string;
  userId: string;
  role: string;
  user?: { email?: string; name?: string | null };
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
}

const ROLES = ["admin", "user", "viewer"] as const;

export function OrgSettings() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: session } = useSession();
  const selfUserId = session?.user?.id ?? null;
  const orgId = activeOrg?.id ?? null;
  const [orgName, setOrgName] = useState(activeOrg?.name ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [memberLimit, setMemberLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [m, inv, mem, sub] = await Promise.all([
        authClient.organization.listMembers({ query: { organizationId: orgId } }),
        authClient.organization.listInvitations({ query: { organizationId: orgId } }),
        fetch(`/api/orgs/${orgId}/membership`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/billing/subscription?orgId=${orgId}`).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (m.error) throw new Error(m.error.message ?? "Could not list members");
      setMembers(((m.data as { members?: Member[] })?.members ?? []) as Member[]);
      setInvitations(((inv.data ?? []) as Invitation[]).filter((i) => i.status === "pending"));
      setMyRole((mem as { role?: string } | null)?.role ?? null);
      const plan = (sub as { plan?: { maxUsers?: number | null } } | null)?.plan;
      setMemberLimit(plan && typeof plan.maxUsers === "number" ? plan.maxUsers : null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    setOrgName(activeOrg?.name ?? "");
    void refresh();
  }, [activeOrg?.name, refresh]);

  async function run(fn: () => Promise<{ error?: { message?: string } | null }>, ok: string) {
    try {
      const { error } = await fn();
      if (error) throw new Error(error.message ?? "Failed");
      toast.success(ok);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  const isAdmin = myRole === "admin";

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization settings</h1>
        <p className="text-sm text-muted-foreground">Workspace profile, members, and invitations.</p>
      </div>
      {!orgId && <p className="text-sm text-muted-foreground">Select an organization first.</p>}

      {orgId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Rename this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!isAdmin} />
              {isAdmin && (
                <Button
                  onClick={() =>
                    run(
                      () =>
                        authClient.organization.update({ organizationId: orgId, data: { name: orgName } }),
                      "Workspace renamed",
                    )
                  }
                >
                  Save
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>Who has access to this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <div>
                    <div className="font-medium">{m.user?.email ?? m.userId}</div>
                    <div className="mt-1 flex gap-1">
                      <Badge>{m.role}</Badge>
                      {m.userId === selfUserId && <Badge>you</Badge>}
                    </div>
                  </div>
                  {isAdmin && m.userId !== selfUserId && (
                    <div className="flex gap-2">
                      <Select
                        value={m.role}
                        onValueChange={(v) =>
                          run(
                            () =>
                              authClient.organization.updateMemberRole({
                                memberId: m.id,
                                role: v,
                                organizationId: orgId,
                              }),
                            "Role updated",
                          )
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => setRemoveId(m.id)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Invite member</CardTitle>
                <CardDescription>
                  {memberLimit !== null
                    ? `This workspace is limited to ${memberLimit} user${memberLimit === 1 ? "" : "s"}. Contact us to add more.`
                    : "They join with the selected role after accepting."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={memberLimit !== null && members.length >= memberLimit}
                    onClick={() =>
                      run(async () => {
                        const r = await authClient.organization.inviteMember({
                          email: inviteEmail,
                          role: inviteRole,
                          organizationId: orgId,
                        });
                        setInviteEmail("");
                        return r;
                      }, "Invitation sent")
                    }
                  >
                    Invite
                  </Button>
                </div>
                {invitations.length > 0 && (
                  <div className="space-y-1">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                        <span>
                          {inv.email} · <Badge>{inv.role}</Badge>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            run(() => authClient.organization.cancelInvitation({ invitationId: inv.id }), "Invitation canceled")
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={removeId !== null} onOpenChange={(o) => !o && setRemoveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this member?</DialogTitle>
            <DialogDescription>They immediately lose access to this workspace.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const id = removeId;
                setRemoveId(null);
                if (id && orgId) {
                  void run(
                    () => authClient.organization.removeMember({ memberIdOrEmail: id, organizationId: orgId }),
                    "Member removed",
                  );
                }
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
