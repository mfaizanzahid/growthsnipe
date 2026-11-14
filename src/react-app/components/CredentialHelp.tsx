import { useState } from "react";
import { toast } from "sonner";
import { PLATFORM_OPTIONS } from "../lib/platforms";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

function SpectoraSteps() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <ol className="list-decimal space-y-2 pl-5">
        <li>Sign in to Spectora in your browser.</li>
        <li>
          Open{" "}
          <a
            className="underline"
            href="https://developer.spectora.com/settings/api-keys"
            target="_blank"
            rel="noreferrer"
          >
            developer.spectora.com
          </a>{" "}
          in the same browser.
        </li>
        <li>Click Login, then Authorize.</li>
        <li>Open your username menu, then API Keys, then Create API Key.</li>
        <li>
          Copy the key and paste it here. The key inherits the permissions of the user who created
          it, so a dedicated staff account is recommended.
        </li>
      </ol>
      <p>
        Need more detail?{" "}
        <a
          className="underline"
          href="https://support.spectora.com/en/articles/15468008-spectora-api-mcp-faqs"
          target="_blank"
          rel="noreferrer"
        >
          Read the Spectora API guide
        </a>
        .
      </p>
    </div>
  );
}

function IsnSteps() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <ol className="list-decimal space-y-2 pl-5">
        <li>Sign in to ISN.</li>
        <li>Open Settings, then My Access Keys.</li>
        <li>Copy the Company key, Access key, and Secret access key.</li>
        <li>
          The ISN host is the web address you use for ISN, for example inspectionsupport.com or a
          white-label domain such as goisn.net, without anything after the domain.
        </li>
        <li>
          Paste all four values here. Access keys do not expire and carry the permissions of the user
          who owns them.
        </li>
      </ol>
      <p>
        Need more detail?{" "}
        <a
          className="underline"
          href="https://help.inspectionsupport.com/en/articles/16904500-finding-access-keys-in-isn"
          target="_blank"
          rel="noreferrer"
        >
          Read the ISN access key guide
        </a>
        .
      </p>
    </div>
  );
}

/** Inline credential help link + platform-specific instructions. */
export function CredentialHelpLink({ provider }: { provider: string }) {
  const [open, setOpen] = useState(false);
  const platform = PLATFORM_OPTIONS.find((option) => option.key === provider);

  function openHelp() {
    if (!provider || !platform) {
      toast.error("Please select a platform.");
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="text-xs font-medium text-primary underline underline-offset-4"
        onClick={openHelp}
      >
        How to find my credentials?
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>How to find your {platform?.label} credentials</DialogTitle>
            <DialogDescription>
              Follow these steps, then paste the credentials into the form.
            </DialogDescription>
          </DialogHeader>
          {provider === "spectora" ? <SpectoraSteps /> : <IsnSteps />}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
