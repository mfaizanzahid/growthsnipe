import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

const CATEGORIES: Array<{ title: string; items: string[] }> = [
  {
    title: "Math Before Marketing",
    items: [
      "The Growth Equation: How to turn a revenue goal into a monthly job target.",
      "What Is Your Real Cost per Booked Job?",
      "A Simple Capacity Calculator for Owner-Operated Service Businesses.",
    ],
  },
  {
    title: "Speed and Capture",
    items: [
      "What Happens After a Missed Call?",
      "The Unbooked Enquiry Follow-Up Sequence.",
      "A Call-Handling Checklist for Busy Field Teams.",
    ],
  },
  {
    title: "Ticket and Packaging",
    items: [
      "How to Build a Clear Good-Better-Best Service Offer.",
      "Add-On Prompts That Help Customers Make Informed Decisions.",
      "Average Ticket: What to Measure Before Changing Prices.",
    ],
  },
  {
    title: "Referral Partners",
    items: [
      "The Partner Flywheel: From First Introduction to Repeat Referrals.",
      "How to Identify Dormant Referral Relationships.",
      "A Useful Follow-Up Script for Referral Partners.",
    ],
  },
  {
    title: "Software and Automation",
    items: [
      "The Eight Revenue Loops Every Service Business Should Review.",
      "CRM Pipeline Stages for Home-Service Companies.",
      "How to Audit Your Booking and Follow-Up Workflows.",
    ],
  },
  {
    title: "Running the Business",
    items: [
      "When Is It Time to Hire Another Technician?",
        "A Real-Time Growth Dashboard for Owners.",
      "How to Turn a Marketing Report into an Operating Decision.",
    ],
  },
];

export function Resources() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Resources"
        title="Better growth decisions start with better questions."
        lede="Explore practical guides for improving lead response, booking, job value, referral relationships, customer follow-up and business performance. Start with free SNIPE Loops™, then go deeper where it counts."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="text-center">
          <Button size="lg" asChild>
            <Link to="/loop-library">Download SNIPE Loops™</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <Card key={c.title}>
              <CardHeader>
                <CardTitle className="text-base">{c.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {c.items.map((item) => (
                    <li key={item} className="border-l-2 border-primary/30 pl-3">
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
          Full guides publish to the <Link className="underline" to="/blog">blog</Link> as they are released. The fastest way to get value now is SNIPE Loops™.
        </p>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
          <SectionHeading
            eyebrow="Featured lead magnet"
            title="Get SNIPE Loops™ free."
            body="Practical recipes and scripts for the follow-up your team never has enough time to build."
          />
          <div className="mt-6">
            <Button size="lg" asChild>
              <Link to="/loop-library">Download SNIPE Loops™</Link>
            </Button>
          </div>
        </div>
      </section>

      <CtaBand
        title="Learn the system, then run it."
        body="Start with the free recipes. When you want the full plan, book a call."
      />
    </MarketingLayout>
  );
}
