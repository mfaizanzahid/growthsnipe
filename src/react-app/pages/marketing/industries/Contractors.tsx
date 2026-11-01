import { IndustryTemplate } from "./_template";

export function Contractors() {
  return (
    <IndustryTemplate
      copy={{
        eyebrow: "For general contractors, remodelers and builders",
        title: "Stop treating every project enquiry like the same lead.",
        lede: "High-value projects need a structured path from enquiry to qualification, consultation, estimate, follow-up and signed work. GrowthSnipe helps create that path, keep prospects moving and show where project opportunities are being won or lost.",
        heroCta: "Build My Contractor Growth Plan",
        gapsTitle: "Where contractor growth gets stuck",
        gaps: [
          "Enquiries arrive without enough detail to qualify the project.",
          "Time is spent on projects outside the ideal scope or budget.",
          "Estimates are delivered but not followed up systematically.",
          "Long decision cycles cause good prospects to go cold.",
          "Past customers, designers, realtors and trade partners are not nurtured.",
          "The owner cannot easily see pipeline value, stage movement and expected workload.",
        ],
        buildTitle: "What we build for contractors",
        buildIntro: "Qualification, nurture and pipeline visibility for high-value project work.",
        builds: [
          "Project enquiry forms and qualification workflows.",
          "Consultation and estimate pipeline stages.",
          "Long-cycle nurture and quote follow-up.",
          "Referral partner and past-client campaigns.",
          "Local service-area marketing and paid acquisition.",
          "Pipeline dashboards connecting lead source, project value, stage and outcomes.",
        ],
        buildsCta: "Find My Contractor Growth Gaps",
        finalTitle: "Build a project pipeline that is easier to qualify and harder to lose track of.",
      }}
    />
  );
}
