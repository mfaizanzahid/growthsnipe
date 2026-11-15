import { useState } from "react";
import { toast } from "sonner";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";

export function Contact() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, message }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not send your message");
      setSent(true);
      toast.success("Message sent: we'll get back to you.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your message");
    } finally {
      setPending(false);
    }
  }

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Contact"
        title="Get your free Revenue Leak Scorecard"
        lede="Tell us what you run and roughly how many inspections you do a month. We will reply within one business day with next steps or a discovery time."
      />
      <section className="mx-auto w-full max-w-xl px-4 pb-14">
        <Card>
          <CardHeader>
            <CardTitle>{sent ? "Message sent" : "Send a message"}</CardTitle>
            {!sent && <CardDescription>We usually reply within one business day.</CardDescription>}
          </CardHeader>
          <CardContent>
            {sent ? (
              <p className="text-sm text-muted-foreground">Thanks. Check your inbox for our reply.</p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-first-name" required>First name</Label>
                    <Input id="contact-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={60} autoComplete="given-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-last-name" required>Last name</Label>
                    <Input id="contact-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required maxLength={60} autoComplete="family-name" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-email" required>Email</Label>
                  <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-message" required>Message</Label>
                  <Textarea id="contact-message" value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={5000} rows={5} />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Sending…" : "Send message"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </MarketingLayout>
  );
}
