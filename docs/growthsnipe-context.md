# GrowthSnipe product context (current)

This file is the authoritative brief for the GrowthSnipe release. Older pre-rebrand documents describe dormant features or historical billing work. When they conflict with this file, this file wins.

## What GrowthSnipe is

GrowthSnipe is a productized growth company for owner-operated home-service businesses, starting with home inspectors on Spectora or ISN.

One-liner: GrowthSnipe finds the revenue leak in a home-service business, fixes it, and shows the owner the booked jobs.

Two ways to buy:
1. **SNIPE Intelligence™**: the analytics and VoiceIQ product. $199/mo, 30-day free trial, no card. Month to month after the trial.
2. **Engine Core and Engine Command**: plan-plus-operator engagements. We build the system, launch it, and run it with the client's team or ours.

## Offer ladder

| Offer | Purpose | Price display |
| --- | --- | --- |
| Revenue Leak Scorecard | Free diagnostic that sizes the gap | Free |
| Workbooks and webinar | Education and lead nurture | Free |
| Discovery call | Fit and scoping conversation | Free |
| Loop Library | Reusable growth playbooks | Contact us for pricing |
| Snipe Diagnostic | Paid data teardown and Leak Map | Contact us for pricing |
| Snipe Blueprint | Written growth plan | Contact us for pricing |
| SNIPE Engine Core | Build plus operator, client team answers first | Contact us for pricing |
| SNIPE Engine Command | Build plus operator, our live team answers first | Contact us for pricing |
| SNIPE Intelligence™ | Analytics and VoiceIQ dashboard | $199/mo, 30-day free trial |

Hard rule: only SNIPE Intelligence™ may display a price in the app or public UI. Every other plan or tier renders no price and a "Contact us for pricing" CTA to `/contact`. All prices come from `GET /api/plans`.

## Commercial terms (internal reference, not UI)

- Engine engagements have a six-month minimum.
- Setup is paid 50/50.
- The first 10 clients receive a 12-month price lock.
- Command includes up to 100 combined human hours per month. Extra hours are $500 per 20-hour block.
- Core human intake pack is $799/mo.
- Core delivery guarantee: live in 30 days or the next management month is free.
- Optimization extension continues at no added management fee until agreed targets are met.
- Intake rule: Voice AI is always fallback. On Core the client's team answers first. On Command our live team answers first.

## SNIPE System

Five pillars:
1. Size the Gap
2. Net-Ticket Architecture
3. Instant Capture
4. Pipeline Engine
5. Expand and Evaluate

Ten frameworks: Growth Equation, Leak Map, Ticket Ladder, Instant Capture Protocol, Channel Math Model, Partner Flywheel, Authority Stack, Revenue Loops, Capacity Trigger Ladder, Guardrail Scorecard.

Four-phase climb: Foundation (months 1 to 3), Scale (4 to 6), Capacity (7 to 9), Optimize (10 to 12).

Starting targets: speed to lead under 5 minutes, answer rate above 90%, lead-to-booked up 10 points, 12 to 15 new reviews per month, revenue within 10% of plan.

## SNIPE VoiceIQ™

Every recorded call is scored against four indicators:
- empathy and urgency in the greeting: target 100%, weight 15%
- due diligence and timeline questions: target above 90%, weight 25%
- ancillary up-sell offer: target above 80%, weight 25%
- confirmed next step and booking: target above 75%, weight 35%

Flag any call under 70, or any booking-intent call without a confirmed next step. Alerts go out within one hour to the pod lead on Command or the owner on Core.

## 21-day launch runway

- Days 1 to 3: technical ingestion.
- Days 4 to 8: booking platform overhaul.
- Days 9 to 14: GoHighLevel, telephony, live answer routing, Voice AI fallback.
- Days 15 to 21: launch and verification.
- Days 22 to 90: optimize and ramp.

## Paid media

Channels: Google Search and Maps, Local Services Ads where available, Meta retargeting. Command adds Meta and LinkedIn campaigns to booking agents.

Judge every campaign on cost per booked inspection. Guardrail: spend no more than about 15% of the average inspection fee per booked job. Scale budget in steps of about 20% when the guardrail holds for two weeks and the calendar has capacity. Pause a campaign that reaches twice the target cost with no bookings. The client pays the platforms directly and owns every account.

## Voice

- Direct, plain, numerate, calm.
- Lead with the problem in dollars.
- Short sentences. Second person.
- No em dashes. Use commas, periods, or colons.
- No hype, no income or ranking guarantees, no implied endorsements.
- One CTA per asset.
- About an 8th-grade reading level.

Illustrative case studies and testimonials are allowed when realistic and clearly labeled illustrative. Label retail-equivalent value estimates as estimates.

## App surfaces

Public: `/`, `/features`, `/how-it-works`, `/integrations`, `/who-we-help`, `/case-studies`, `/blog`, `/pricing`, `/privacy`, `/terms`, `/contact`, `/login`, `/signup`, `/onboarding`.

Dashboard: `/dashboard` scorecard, `/connections`, `/business-profile`, `/billing`, `/settings`, `/profile`.

Superadmin: `/superadmin` clients, invoices, charges, refunds, plans, coupons, settings.

Hidden for this release: `/mcp-access`, `/employees`, `/briefings-schedules`. The code remains and must not be deleted.
