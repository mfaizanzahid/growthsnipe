export interface BlogSection {
  heading: string;
  paragraphs: string[];
}

export interface BlogPostData {
  slug: string;
  title: string;
  dek: string;
  date: string;
  readMinutes: number;
  pillar: string;
  metaDescription: string;
  relatedLinks: { label: string; to: string }[];
  sections: BlogSection[];
}

export const POSTS: BlogPostData[] = [
  {
    slug: "find-the-leak-before-buying-ads",
    title: "Find the leak before you buy more ads",
    dek: "If the phone is not answered, paid traffic just makes the leak more expensive. A simple order of operations for home-service owners.",
    date: "October 2026",
    readMinutes: 5,
    pillar: "Diagnostics",
    metaDescription:
      "Why home-service owners should fix missed calls and ticket consistency before increasing paid ad spend. A practical order of operations.",
    relatedLinks: [
      { label: "How it works", to: "/how-it-works" },
      { label: "Pricing", to: "/pricing" },
      { label: "Get a Leak Scorecard", to: "/contact" },
    ],
    sections: [
      {
        heading: "Ads amplify whatever is already happening",
        paragraphs: [
          "A campaign does not fix a phone that rings out during an inspection. It sends more calls into the same hole, then reports them as leads. The owner sees a busy week and a flat bank account, and concludes that ads do not work in their market.",
          "The order matters: capture, ticket, follow-up, then traffic. Buying traffic first is how a growth budget turns into a lead report nobody can use.",
        ],
      },
      {
        heading: "Start with answer rate and speed to lead",
        paragraphs: [
          "Count the calls that came in last month and the calls that were answered live. Then measure how long a new web lead waited for the first reply. Those two numbers explain more lost revenue than any ad platform setting.",
          "If the answer rate is below 90 percent, or first replies take hours, a live answer process and a Voice AI fallback will usually beat a bigger ad budget. Fix the phone first.",
        ],
      },
      {
        heading: "Then make the ticket consistent",
        paragraphs: [
          "Average ticket rarely falls because the market moved. It falls because add-ons are offered when someone remembers. A simple three-tier package and a short add-on script make the offer consistent across every inspector.",
          "Consistency is the point. You are not trying to pressure anyone. You are trying to stop the outcome from depending on who answered the phone.",
        ],
      },
      {
        heading: "Only then add paid traffic",
        paragraphs: [
          "Once calls are answered and the ticket is consistent, paid media has a fair test. Judge it on cost per booked inspection, not clicks or form fills. A campaign that books jobs at a sane cost is a keeper. A campaign that spends twice the target and books nothing gets paused.",
          "That sequence is the core of the SNIPE System, and it is why every GrowthSnipe engagement starts with the leak rather than a media plan.",
        ],
      },
    ],
  },
  {
    slug: "average-ticket-without-raising-prices",
    title: "Raise average ticket without raising your base price",
    dek: "The fastest ticket gain is usually not a price increase. It is making the same add-on offer every time.",
    date: "October 2026",
    readMinutes: 5,
    pillar: "Net Ticket",
    metaDescription:
      "How home inspectors raise average ticket with consistent package tiers and add-on offers, without raising the base inspection fee.",
    relatedLinks: [
      { label: "SNIPE Intelligence™ features", to: "/features" },
      { label: "Case studies", to: "/case-studies" },
      { label: "Talk to us", to: "/contact" },
    ],
    sections: [
      {
        heading: "The leak is inconsistency",
        paragraphs: [
          "Two inspectors can run the same base fee and finish the month hundreds of dollars apart per job. The difference is rarely skill. It is whether radon, mold, sewer scope, and other add-ons were offered at booking time or mentioned as an afterthought.",
          "Consistency beats persuasion. A clear package ladder makes the offer normal, removes the awkward pitch, and gives the customer a real choice.",
        ],
      },
      {
        heading: "Build three tiers, not ten options",
        paragraphs: [
          "A good ladder has a clear good, better, and best. Each tier should be easy to explain in one sentence and easy to book without a custom quote. The middle tier usually becomes the anchor.",
          "Keep the base inspection honest. The tiers should add scope and convenience, not hide the thing the customer actually needs.",
        ],
      },
      {
        heading: "Measure ticket by inspector, not just company-wide",
        paragraphs: [
          "A company average hides the coaching opportunity. When one inspector runs a materially lower ticket, the fix is a conversation and a script, not a company-wide price change.",
          "Track average ticket weekly, next to the add-on attach rate. If ticket moves but attach rate does not, something else changed and you should know what.",
        ],
      },
    ],
  },
  {
    slug: "cost-per-booked-inspection",
    title: "The only ad number that matters: cost per booked inspection",
    dek: "Clicks, impressions, and leads are inputs. A booked job on the calendar is the output. Measure accordingly.",
    date: "September 2026",
    readMinutes: 6,
    pillar: "Paid Media",
    metaDescription:
      "How to judge home-service paid ads on cost per booked inspection, set a sane guardrail, and decide when to scale or pause.",
    relatedLinks: [
      { label: "Features", to: "/features" },
      { label: "Pricing", to: "/pricing" },
      { label: "Book a discovery call", to: "/contact" },
    ],
    sections: [
      {
        heading: "Leads are not jobs",
        paragraphs: [
          "A form fill can be a homeowner kicking tires. A booked inspection has an address, a service, a price, and a slot on the calendar. Those are different events, and only one of them pays the bills.",
          "The gap matters because lead quality varies by channel and by week. A campaign that looks efficient on leads can be the worst performer on booked jobs.",
        ],
      },
      {
        heading: "Set a guardrail before launch",
        paragraphs: [
          "Pick a maximum acceptable cost per booked inspection, usually a modest share of the average inspection fee. Write it down before the first campaign goes live, so the decision is not made in the middle of a good or bad week.",
          "Then set two rules: scale when the number holds under target with calendar capacity, and pause when spend reaches twice the target with no bookings. No exceptions for a campaign that feels promising.",
        ],
      },
      {
        heading: "Attribute the whole path",
        paragraphs: [
          "Use one tracking number per channel, a geo landing page that matches the ad, and a booking flow that records the source. If the source is guessed at the end, the report is fiction.",
          "This is also where speed to lead shows up. A paid lead that waits four hours is not the same lead as one answered in four minutes, even if both eventually book.",
        ],
      },
      {
        heading: "Scale on proof, not hope",
        paragraphs: [
          "When a campaign beats the guardrail for two weeks and the calendar has room, raise the budget in steps of about 20 percent. Give each step time to settle before judging it.",
          "The goal is not the biggest spend. It is the most booked jobs at a cost the business can carry.",
        ],
      },
    ],
  },
  {
    slug: "weekly-scorecard-five-lines",
    title: "A weekly scorecard that fits on five lines",
    dek: "Most reports are too long to use. These five lines are enough to decide what to do this week.",
    date: "September 2026",
    readMinutes: 4,
    pillar: "Intelligence",
    metaDescription:
      "A five-line weekly scorecard for home-service owners: booked jobs, average ticket, answer rate, speed to lead, and cost per booked job.",
    relatedLinks: [
      { label: "SNIPE Intelligence™", to: "/features" },
      { label: "How it works", to: "/how-it-works" },
      { label: "Start the free trial", to: "/pricing" },
    ],
    sections: [
      {
        heading: "Five lines, one decision each",
        paragraphs: [
          "Booked jobs tells you whether demand is real. Average ticket tells you whether the offer is consistent. Answer rate tells you whether capture is working. Speed to lead tells you whether the follow-up is alive. Cost per booked inspection tells you whether paid traffic is earning its place.",
          "Each line points to a different action. That is the test of a useful scorecard: every number should change a decision.",
        ],
      },
      {
        heading: "Compare to last week, not to your best week",
        paragraphs: [
          "The comparison that matters is recent and fair. Same weekday mix, same season, same market. Comparing to a record month creates anxiety, not insight.",
          "Write the number down every week. Memory edits the past, and a four-week trail is where the trend becomes obvious.",
        ],
      },
      {
        heading: "Put the scorecard where the work happens",
        paragraphs: [
          "A scorecard that lives in an inbox gets read once. One that is reviewed in a short weekly call, with one owner for each line, changes behavior.",
          "GrowthSnipe builds the scorecard from your booking software, CRM, phones, and ad accounts, then reviews it with you. The point is not the report. The point is the next decision.",
        ],
      },
    ],
  },
];

export function getPost(slug: string): BlogPostData | undefined {
  return POSTS.find((p) => p.slug === slug);
}
