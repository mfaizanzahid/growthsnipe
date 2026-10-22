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
    slug: "five-numbers-monday-morning",
    title: "Five numbers to check on Monday morning",
    dek: "A ten-minute routine for home inspectors: the five figures that tell you whether the month is on track — and what to do when one of them moves.",
    date: "September 2026",
    readMinutes: 6,
    pillar: "Diagnostics",
    metaDescription:
      "A ten-minute Monday routine for home inspectors: five numbers that show whether the month is on track, and what to do when one moves.",
    relatedLinks: [
      { label: "Tradesmatic for home inspectors", to: "/who-we-help/home-inspectors" },
      { label: "Tradesmatic for Spectora", to: "/integrations/spectora" },
      { label: "How it works in four steps", to: "/how-it-works" },
    ],
    sections: [
      {
        heading: "Why Monday, why five",
        paragraphs: [
          "Most slow months are not surprises. They are drifts — a referral source cooling in March that shows up as a hole in May, a ticket mix shifting toward smaller jobs one booking at a time. By the time the bank balance tells you, the cause is six weeks old.",
          "Monday takes ten minutes and catches drift while it is still cheap to fix. These are the five numbers worth your coffee.",
        ],
      },
      {
        heading: "1. Jobs booked vs. the same week last month",
        paragraphs: [
          "Not revenue — count. Count moves first and lies less. Pull last week's booked inspections and compare against the same week four weeks ago, not against your best week ever.",
          "If the count dropped by two or more with no seasonal reason, you have a pipeline question, not a pricing question. Ask who stopped sending work before you ask what to charge.",
        ],
      },
      {
        heading: "2. Average fee per job",
        paragraphs: [
          "Add up quoted fees for the week, divide by jobs. A slip of 30 to 40 per job across a full schedule quietly erases a whole inspection from the month — and it usually means ancillary services stopped being offered, not that the market moved.",
          "When this number dips, the fix is a conversation at booking time, not a rate change. Check whether radon, sewer scope, or mold add-ons are still being quoted on every eligible job.",
        ],
      },
      {
        heading: "3. Top three referral sources, and their trend",
        paragraphs: [
          "Name the three agents or channels that sent the most work over the last 90 days, then look at each one's last three weeks separately. One cooling relationship explains more slow months than any market force.",
          "A source that sent four jobs a month and now sends one is not gone — it is drifting. A call this week costs nothing and recovers more revenue than any ad you could buy.",
        ],
      },
      {
        heading: "4. Unconfirmed and unscheduled follow-ups",
        paragraphs: [
          "Count every booking that is quoted but unconfirmed and every past client owed a follow-up. This is found money hiding in your own system — work you already earned once and haven't collected.",
          "If the list is longer than five, block one hour this week for nothing else. Few exercises pay better per hour.",
        ],
      },
      {
        heading: "5. Next week's capacity",
        paragraphs: [
          "Look at booked slots against available slots for the coming week. Below half full with three days to go means this is a marketing week; above 80 percent means it is a delivery week and you should protect your inspection quality.",
          "Knowing which kind of week it is changes every decision you make before Friday.",
        ],
      },
      {
        heading: "The routine, on one sticky note",
        paragraphs: [
          "Count, average fee, top three sources, follow-up list, next-week capacity. Ten minutes, same order, every Monday. Write each number down — memory edits the past, paper doesn't.",
          "This is also exactly what a morning briefing does for you: the same five checks, run against your live data before you wake up, with the anomalies flagged and real data behind each one. The routine works by hand; it just works earlier with help.",
        ],
      },
    ],
  },
  {
    slug: "what-real-time-ai-access-means",
    title: "What “real-time AI access” actually means",
    dek: "Every AI tool claims to know your business. Almost none of them do. Here is the plain-language difference between pasting numbers into a chat window and a live connection — and why it changes the answers.",
    date: "September 2026",
    readMinutes: 5,
    pillar: "AI, plainly explained",
    metaDescription:
      "What real-time AI access means: the difference between pasting numbers into a chat window and a live connection to your business software.",
    relatedLinks: [
      { label: "How the Multi-Trades™ MCP Server works", to: "/technology" },
      { label: "How it works in four steps", to: "/how-it-works" },
      { label: "How we handle your data", to: "/security" },
    ],
    sections: [
      {
        heading: "The copy-paste trap",
        paragraphs: [
          "If you have tried asking an AI tool about your business, you know the ritual: export a report, trim it to fit, paste it in, explain what every column means, and hope the answer survives the context you forgot to include. Then do it all again next week, because the chat forgot everything.",
          "That is not the AI failing. It is the setup failing. The AI is reasoning about a stale snapshot you hand-built, with no way to check anything and no memory of last time. Good analysis cannot come out of that arrangement, no matter how good the model is.",
        ],
      },
      {
        heading: "A live connection instead",
        paragraphs: [
          "Real-time access means the AI reads your business software directly, at the moment you ask. “How did we do this week?” triggers a live read of your actual orders, fees, and schedule — this week's data, compared against last week's, with real data behind every number in the answer.",
          "Three things change. First, the numbers are current — never last month's export. Second, the AI can verify: every claim links back to an entry you can open yourself. Third, context accumulates: your services, team, goals, and seasonality are part of the setup, so February is read as February, not as a bad June.",
        ],
      },
      {
        heading: "Why “with evidence” is the whole game",
        paragraphs: [
          "An AI that cannot show its work is a stranger with opinions. Demand the source behind every number: which jobs, which clients, which dates. If the answer can't point at source data, treat it as a suggestion, not a fact.",
          "This is also why pass-through architecture matters. When nothing is stored and everything is read live, there is exactly one version of the truth — the one in your own system. The AI and you are looking at the same thing.",
        ],
      },
      {
        heading: "What it doesn't do",
        paragraphs: [
          "It doesn't replace your accountant, and it doesn't guarantee outcomes. Briefings and answers are generated from your connected data and can be incomplete — verify consequential decisions against source data. What it does is collapse the distance between “something feels off” and “here is the data that proves it,” from weeks to minutes.",
        ],
      },
      {
        heading: "The one-question test",
        paragraphs: [
          "Ask any AI setup you are evaluating: “Which referral sources slipped in the last three weeks, and show me the jobs.” If it needs you to build the spreadsheet first, it doesn't have access — you are the access. If it reads your system live and answers with real data, that's the real thing.",
        ],
      },
    ],
  },
  {
    slug: "why-busy-does-not-mean-profitable",
    title: "Why “Busy” Doesn't Mean Profitable",
    dek: "A full schedule can still pay unevenly. How home inspectors mix up count with profit — and the three-number check that tells the truth.",
    date: "September 2026",
    readMinutes: 5,
    pillar: "Myth-busting",
    metaDescription:
      "A full schedule can still pay unevenly. Why busy doesn't mean profitable for home inspectors, and the three-number check that tells the truth.",
    relatedLinks: [
      { label: "Tradesmatic for home inspectors", to: "/who-we-help/home-inspectors" },
      { label: "Meet the seven advisors", to: "/advisors" },
      { label: "How it works in four steps", to: "/how-it-works" },
    ],
    sections: [
      {
        heading: "The full-board trap",
        paragraphs: [
          "Every inspector knows the week I'm describing: booked solid Monday to Friday, phone still ringing, truck always moving — and the month closes softer than a quiet one did. It feels wrong, so most owners blame the market, the season, or their rates.",
          "Usually it is none of those. A full schedule measures count, and count is not profit. What you earned per job, which jobs they were, and where they came from decide the month — and none of that shows up on a full calendar.",
        ],
      },
      {
        heading: "Count moves first, ticket decides",
        paragraphs: [
          "Two shops can each run 20 inspections in a week and land thousands apart. One runs standard inspections with radon and sewer scope included; the other runs discounted base inspections with no add-ons quoted. Same count, different business.",
          "This is why comparing weeks by job count alone misleads. Count tells you whether the phone rang. Average fee tells you whether the ringing paid.",
        ],
      },
      {
        heading: "The mix shift that hides inside busy",
        paragraphs: [
          "The most common profit leak in a busy inspection business is mix drift: gradually, the schedule fills with smaller jobs. Fewer ancillaries quoted at booking, more price-shopped base inspections, a slow slide in average fees — while the calendar looks healthier than ever.",
          "Nobody notices because the top-line revenue holds for a while. Volume covers the drift right up until it doesn't, usually in a month with one rainout too many.",
        ],
      },
      {
        heading: "Referral quality beats referral count",
        paragraphs: [
          "Not all booked work is equal either. A week of agent-referred full inspections with add-ons out-earns a week of online price-shoppers by a wide margin — even at identical counts. When a top referring agent cools off and online leads fill the gap, the schedule stays full and the profit quietly leaves.",
          "If you only track total bookings, this swap is invisible. Track bookings by source and the story tells itself.",
        ],
      },
      {
        heading: "The three-number check",
        paragraphs: [
          "Once a month, write down three numbers: jobs completed, average fee per job, and bookings by source with each source's trend. If count is up and the fee is down, you have a mix problem. If the fee holds and revenue lags, you have a count problem. If one source faded while another filled in, you have a relationship problem worth one phone call.",
          "Three numbers, ten minutes, no spreadsheet skills required. Do it on the first Monday of the month and slow months stop being mysteries.",
        ],
      },
      {
        heading: "Key takeaways",
        paragraphs: [
          "Busy measures count; profit lives in fee, mix, and source. When the month feels wrong despite a full board, split the numbers before changing anything — the fix for a mix problem (quote the add-ons) is the opposite of the fix for a count problem (win back the agent).",
        ],
      },
    ],
  },
  {
    slug: "what-is-an-mcp-server-plain-english",
    title: "What Is an MCP Server, in Plain English",
    dek: "No jargon, no diagrams: what an MCP server actually is, what it connects, and why it matters to an owner who just wants answers from real data.",
    date: "September 2026",
    readMinutes: 5,
    pillar: "AI, plainly explained",
    metaDescription:
      "What is an MCP server, in plain English: what it connects, what it doesn't do, and why it matters to owners who want answers from real data.",
    relatedLinks: [
      { label: "How the Multi-Trades™ MCP Server works", to: "/technology" },
      { label: "How it works in four steps", to: "/how-it-works" },
      { label: "Meet the seven advisors", to: "/advisors" },
    ],
    sections: [
      {
        heading: "The 30-second version",
        paragraphs: [
          "An MCP server is a translator that lets an AI tool like Claude, ChatGPT, or Gemini read another piece of software. Your AI is fluent in conversation but blind to your business; the business software holding your jobs and clients speaks no conversation at all. The MCP server sits between them and translates, both directions, in real time.",
          "That is the whole idea. Everything else is implementation detail you should never need to think about.",
        ],
      },
      {
        heading: "What it connects",
        paragraphs: [
          "On one side: the AI you already use — Claude, ChatGPT, and Gemini. On the other: the software you run the business in — for a home inspector, Spectora or ISN, with its inspections, clients, agents, and events. The server exposes the business side as plain questions the AI side can ask: how did this week compare, which referrals slipped, what needs attention today.",
          "Our version is called the Multi-Trades™ MCP Server, and it is purpose-built for home service trades: same questions, trade-aware answers, whether the underlying software is Spectora, ISN, ServiceTitan, Housecall Pro, or Jobber.",
        ],
      },
      {
        heading: "What it is not",
        paragraphs: [
          "It is not storage. A well-built MCP connection reads your software when you ask and keeps nothing — your business data stays in your system, and disconnecting ends access. It is not a dashboard either: you never log into it. You ask a question in the AI you already open, and the answer comes back with real data behind it.",
          "And it is not the product. The product is what the connection makes possible: advisors that know your numbers, briefings built from them, and actions you approve. The server is plumbing — good plumbing you never think about.",
        ],
      },
      {
        heading: "Why an inspector should care",
        paragraphs: [
          "Because the alternative is the copy-paste trap: exporting reports, trimming them to fit a chat window, explaining every column, and repeating it all next week when the chat forgets. A live connection replaces that ritual with a question. “Which agents cooled off this month?” gets an answer from real data instead of an evening of spreadsheet work.",
          "The test is simple: if the setup needs you to build the spreadsheet first, you are the connection. If it reads your system and answers, the server is.",
        ],
      },
      {
        heading: "Key takeaways",
        paragraphs: [
          "MCP server = translator between your AI and your software, reading live and storing nothing. Judge any AI setup by one question: does it read my system itself, or does it need me to paste things in? Only the first one scales past a single curious evening.",
        ],
      },
    ],
  },
  {
    slug: "getting-more-out-of-spectora",
    title: "Getting More Out of Spectora",
    dek: "Spectora already holds every answer about your inspection business. The three comparisons it won't do for you — and the monthly habit that replaces them.",
    date: "September 2026",
    readMinutes: 6,
    pillar: "Platform guides",
    metaDescription:
      "Getting more out of Spectora: the three comparisons your inspection data needs every month, and the habit that runs them in minutes.",
    relatedLinks: [
      { label: "Tradesmatic for Spectora", to: "/integrations/spectora" },
      { label: "Tradesmatic for home inspectors", to: "/who-we-help/home-inspectors" },
      { label: "How it works in four steps", to: "/how-it-works" },
    ],
    sections: [
      {
        heading: "The reports you already have",
        paragraphs: [
          "Spectora knows every inspection you ran, every fee you quoted, every agent who sent work, and every slot on the schedule. Its reports will show you any of that on demand — and most inspectors check them the way most people check the oil: when something already smells wrong.",
          "The data isn't the problem. The habit of comparing it is. Spectora shows you snapshots; the insight lives in the comparison.",
        ],
      },
      {
        heading: "Comparison 1: this period vs. last, by the numbers that matter",
        paragraphs: [
          "Pull inspection count, average fee, and service mix for the last 30 days, then the 30 before that. Three deltas tell you nearly everything: count down means a pipeline problem, fee down means a mix or quoting problem, mix shifted means your schedule filled with different work than it used to.",
          "Do this monthly, same day, same three numbers. The month you skip is the month the drift starts.",
        ],
      },
      {
        heading: "Comparison 2: referral sources, trended — not totaled",
        paragraphs: [
          "A total count of inspections per agent tells you who your friends are. A trend tells you who is leaving. For each of your top five referring agents, look at the last twelve weeks in three four-week blocks. Flat is fine. A staircase down — four jobs, then two, then one — is a relationship asking for lunch before it asks for someone else.",
          "This is the comparison almost nobody runs, and it explains more slow months than any other single check.",
        ],
      },
      {
        heading: "Comparison 3: quoted vs. completed add-ons",
        paragraphs: [
          "Radon, sewer scope, mold, thermal imaging: for each ancillary service, compare how many eligible jobs were quoted it against how many completed it. A wide gap is not a demand problem — it is a quoting-at-booking problem, and it is usually fixed with a sentence added to the booking call, not a marketing campaign.",
          "At $100-plus per add-on, closing even half the gap is the highest-paying hour in your month.",
        ],
      },
      {
        heading: "The monthly habit",
        paragraphs: [
          "First Monday of the month, thirty minutes: the three comparisons above, written on one page. Circle anything that moved more than ten percent. Each circled item gets one action with one owner — usually you, usually a phone call, usually this week.",
          "That page is your business review. Everything else is decoration.",
        ],
      },
      {
        heading: "Where a live connection fits",
        paragraphs: [
          "All of the above works by hand — it is just slow, and slow means skipped. A live connection between Spectora and the AI you already use — Claude, ChatGPT, and Gemini — runs the same comparisons from real data on demand: ask “how did this month compare?” and get the deltas with the jobs behind them, no exports, no Monday spreadsheet session.",
          "The habit stays the same. Only the labor changes.",
        ],
      },
    ],
  },
  {
    slug: "why-your-average-fee-drifted",
    title: "Why Your Average Fee Drifted (and How to Catch It)",
    dek: "Revenue looks fine while the average fee quietly slides. The three causes of fee drift in inspection businesses, and how to split the ticket to find yours.",
    date: "September 2026",
    readMinutes: 6,
    pillar: "Diagnostics",
    metaDescription:
      "Why your average inspection fee drifted: mix shift, unquoted add-ons, and quiet discounting — plus how to split the ticket and catch it early.",
    relatedLinks: [
      { label: "Tradesmatic for Spectora", to: "/integrations/spectora" },
      { label: "Tradesmatic for ISN", to: "/integrations/isn" },
      { label: "Tradesmatic for home inspectors", to: "/who-we-help/home-inspectors" },
    ],
    sections: [
      {
        heading: "The symptom nobody feels",
        paragraphs: [
          "Average fee drift is the quietest problem in an inspection business. Revenue holds because volume covers it. The calendar stays full. Then one short month exposes that each job has been paying less than it did last year — and nobody can say when it started.",
          "It started gradually, which is exactly why it needs a method instead of a memory to catch.",
        ],
      },
      {
        heading: "Cause 1: the mix shifted under you",
        paragraphs: [
          "Compare this quarter's completed jobs against the same quarter last year by service type. If base inspections grew while ancillaries shrank as a share, your average fee fell without any single price changing. The schedule filled with smaller work — more condos, fewer full single-family inspections with add-ons.",
          "Mix drift often traces back to a referral change: one agent who sent premium jobs cooled off, and online bookings filled the gap with price-shopped base inspections.",
        ],
      },
      {
        heading: "Cause 2: add-ons stopped being quoted",
        paragraphs: [
          "Pull eligible jobs versus quoted add-ons for radon, sewer scope, and mold over the last 90 days. In most drifting businesses this ratio fell first — a new scheduler who doesn't offer, a booking flow that buried the option, a busy season where quoting felt like friction.",
          "This is the best kind of problem: no new marketing, no price change, just reinstating a sentence at booking time. Every ten points of quote rate recovered is real money per job, permanently.",
        ],
      },
      {
        heading: "Cause 3: quiet discounting",
        paragraphs: [
          "Match completed fees against the rate card. Small courtesy cuts, agent favors, and re-inspection deals compound invisibly — never logged as discounts, just quoted lower.",
          "Individually each one was good judgment. In aggregate they moved the average. The fix isn't zero flexibility; it's seeing the monthly total so flexibility stays a decision instead of a habit.",
        ],
      },
      {
        heading: "How to split the ticket",
        paragraphs: [
          "Take last month's completed jobs and split revenue three ways: base fees, add-on fees, and discounts given versus the rate card. Compare each slice against the same month last year. Whichever slice moved most is your cause — and each cause has exactly one fix: win back the premium source, reinstate the quoting sentence, or cap the courtesy discounts.",
          "Run this split quarterly. It takes twenty minutes and it ends every argument about whether “the market” did it.",
        ],
      },
      {
        heading: "Key takeaways",
        paragraphs: [
          "Fee drift has three usual suspects — mix, unquoted add-ons, quiet discounts — and the split-the-ticket method identifies yours in one sitting. Catch it with a quarterly split and a monthly average-fee glance, and the average becomes something you steer instead of something you discover.",
        ],
      },
    ],
  },
];

export function getPost(slug: string | undefined): BlogPostData | undefined {
  return POSTS.find((p) => p.slug === slug);
}
