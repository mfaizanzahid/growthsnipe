import { useState } from "react";
import { CheckIcon, ChevronDownIcon, PlusIcon, StarIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { toast } from "sonner";
import { authClient } from "../../lib/auth-client";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import type { Org } from "../../hooks/useActiveOrg";

interface Props {
  orgs: Org[];
  activeOrgId: string | null;
  defaultOrgId: string | null;
  onSwitch: (id: string) => Promise<void>;
  onDefault: (id: string) => Promise<void>;
  onChanged: () => void;
}

function slugify(name: string): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export function OrgSwitcher({ orgs, activeOrgId, defaultOrgId, onSwitch, onDefault, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const active = orgs.find((o) => o.id === activeOrgId) ?? null;

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await authClient.organization.create({ name: name.trim(), slug: slugify(name) });
      if (error || !data) throw new Error(error?.message ?? "Could not create organization");
      await authClient.organization.setActive({ organizationId: data.id });
      toast.success(`Switched to ${data.name}`);
      setName("");
      setCreating(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create organization");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 px-2">
                <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
                  {active?.name ?? "Select organization"}
                </span>
                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Switch organization</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {orgs.map((o) => (
            <DropdownMenuItem
              key={o.id}
              className="gap-2"
              onSelect={(e) => {
                e.preventDefault();
                void onSwitch(o.id)
                  .then(() => {
                    toast.success(`Switched to ${o.name}`);
                    setOpen(false);
                    onChanged();
                  })
                  .catch(() => toast.error("Could not switch organization"));
              }}
            >
              <CheckIcon className={cn("size-4 shrink-0", o.id === activeOrgId ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <button
                aria-label={o.id === defaultOrgId ? "Default organization" : "Make default organization"}
                onClick={(e) => {
                  e.stopPropagation();
                  void onDefault(o.id)
                    .then(() => {
                      toast.success(`${o.name} is now your default organization`);
                      onChanged();
                    })
                    .catch(() => toast.error("Could not save default organization"));
                }}
                className="rounded p-0.5 hover:bg-accent"
              >
                {o.id === defaultOrgId ? (
                  <StarSolidIcon className="size-4 text-amber-500" />
                ) : (
                  <StarIcon className="size-4 text-muted-foreground" />
                )}
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              setCreating(true);
            }}
          >
            <PlusIcon className="size-4" /> New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New organization</DialogTitle>
            <DialogDescription>It becomes your active workspace right away.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="org-name">Name</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
