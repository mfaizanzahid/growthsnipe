import { useNavigate } from "react-router-dom";
import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";
import { authClient } from "../../lib/auth-client";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface Props {
  email: string;
  userName: string;
  role: string | null;
  superadmin: boolean;
}

function initials(email: string, name: string): string {
  const base = name.trim() || email;
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function ProfileMenu({ email, userName, role, superadmin }: Props) {
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    navigate("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-1 hover:bg-accent" aria-label="Account menu">
          <Avatar className="size-8">
            <AvatarFallback>{initials(email, userName)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="truncate font-medium">{userName || email}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">{email}</div>
          <div className="mt-1 flex gap-1">
            {role && <Badge>{role}</Badge>}
            {superadmin && <Badge>superadmin</Badge>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/profile")}>Profile</DropdownMenuItem>
        {/* Superadmins are platform operators with no workspace, so org
            settings are not theirs to change. */}
        {!superadmin && (
          <DropdownMenuItem onSelect={() => navigate("/settings")}>Organization settings</DropdownMenuItem>
        )}
        {superadmin && (
          <DropdownMenuItem onSelect={() => navigate("/superadmin")}>Superadmin</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <ArrowRightOnRectangleIcon className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
