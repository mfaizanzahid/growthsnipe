import { IndustryTemplate } from "./_template";

export function Plumbing() {
  return (
    <IndustryTemplate
      copy={{
        eyebrow: "For plumbing companies",
        title: "Win the call. Book the job. Build the next reason to call you.",
        lede: "When a customer has a plumbing problem, response and confidence matter. GrowthSnipe helps your business capture more enquiries, route them properly, follow up estimates and build a more consistent customer lifecycle after the work is done.",
        heroCta: "Build My Plumbing Growth Plan",
        gapsTitle: "Where plumbing growth gets stuck",
        gaps: [
          "High-intent calls missed while technicians are working.",
          "Enquiries not categorized by urgency, service type or location.",
          "Estimates and larger jobs not followed up consistently.",
          "No systematic path from one repair to relevant additional services.",
          "Customers not reminded about appropriate inspections or maintenance.",
          "Referral sources and property relationships managed informally.",
        ],
        buildTitle: "What we build for plumbing",
        buildIntro: "Capture, intake, follow-up and repeat business, configured around urgency and job type.",
        builds: [
          "Configured call capture, intake and routing.",
          "Service-specific enquiry and booking workflows.",
          "Estimate follow-up and lost-opportunity recovery.",
          "Relevant service bundles and cross-sell prompts.",
          "Review, reactivation and referral campaigns.",
          "Paid acquisition and local visibility programs.",
          "Performance reporting tied to booked and completed jobs.",
        ],
        buildsCta: "Find My Plumbing Growth Gaps",
        finalTitle: "Make every enquiry easier to capture, and every customer easier to serve again.",
      }}
    />
  );
}
