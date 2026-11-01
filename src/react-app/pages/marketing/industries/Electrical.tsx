import { IndustryTemplate } from "./_template";

export function Electrical() {
  return (
    <IndustryTemplate
      copy={{
        eyebrow: "For electrical contractors",
        title: "A better growth system for the work you want more of.",
        lede: "Whether you serve residential customers, commercial properties or both, growth requires more than a steady stream of enquiries. You need to qualify the right work, respond consistently, follow up estimates and understand which services and channels create the best opportunities.",
        heroCta: "Build My Electrical Growth Plan",
        gapsTitle: "Where electrical growth gets stuck",
        gaps: [
          "Enquiries not qualified by job type, urgency or project scale.",
          "Calls missed while crews are on-site.",
          "Estimates left without a consistent follow-up cadence.",
          "Uneven demand across service categories.",
          "Limited repeat and referral follow-up.",
          "Marketing activity not connected to job value and capacity.",
        ],
        buildTitle: "What we build for electrical",
        buildIntro: "Qualify the right work, keep estimates moving and connect marketing to completed job value.",
        builds: [
          "Lead capture and service qualification.",
          "Estimate pipeline and follow-up workflows.",
          "Service-specific landing pages and campaign structures.",
          "Review and referral partner loops.",
          "Customer reactivation and relevant maintenance reminders.",
          "Reporting across source, booking, estimate, win rate and completed work.",
        ],
        buildsCta: "Find My Electrical Growth Gaps",
        finalTitle: "Build a pipeline you can see, manage and grow.",
      }}
    />
  );
}
