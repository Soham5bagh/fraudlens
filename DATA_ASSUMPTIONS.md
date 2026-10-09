# Data assumptions

The book is synthetic and seeded (`42`). Regenerating it with `python -m engine.build` produces the same payments, the same queue, and the same suggested actions.

## What is real enough

- **Window.** Payments from 1 May 2026 through 10 Aug 2026. The desk reviews the queue at 10:00 IST on 11 Aug, so device links and merchant history can include payments that posted later in the week. A customer's baseline is still everything before the flagged episode.
- **People.** 181 customers living in Indian cities (Mumbai, Delhi, Bengaluru, Chennai, Kolkata, Hyderabad, Pune, and others), each with a segment (student, everyday, affluent), one account, one card (RuPay, Visa, or Mastercard), and two devices enrolled on the profile at account opening. First names and surnames are drawn from the same community, so the pairs read naturally. Emails are `@example.com`.
- **Money.** Amounts are integer paise in INR and are shown with Indian digit grouping, for example ₹1,23,456.78. Ordinary tickets run from ₹140 to ₹12,800, so a large purchase is an exception, not noise. UPI transfers and cash-outs exist only where a mule chain was planted. UPI transfers carry no card number.
- **Time.** Stored timestamps are UTC. Every screen and case file shows India Standard Time (IST, UTC+05:30).
- **Places and devices.** IP addresses are in the documentation ranges `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24` (RFC 5737). Home and merchant locations are Indian cities. Foreign locations appear only where a trip or an attack was planted (Singapore, London, Ashburn, Lagos, São Paulo, Dubai). A "new device" means a device that is not on the customer's profile and has not appeared on an earlier payment. A second phone the customer already enrolled is not treated as new.
- **Merchants.** A fixed, fictional catalogue (groceries, fuel, restaurants, chai and coffee, travel, gift cards, a crypto exchange, and one collusive digital-goods merchant, Vistar Digital Keys in Gurugram). None of the names are real brands.

## What was planted

| Pattern | What it looks like |
| --- | --- |
| Card testing | Many authorizations under ₹200, several declines, many merchants, a device not on the profile, a datacenter IP abroad, then one larger gift-card charge of about ₹7,000–₹9,500. |
| Account takeover | A new Android phone, a VPN in a country the customer has not used, and gift-card, electronics, or crypto spend many times the baseline. |
| Mule-account chain | Young accounts, a shared laptop, inbound UPI transfers that leave the same day, ending at Sikka Crypto Exchange. |
| Merchant collusion | Six young accounts in Gurugram, two shared laptops, repeated ₹10,000 and ₹20,000 charges at one merchant in a single afternoon. |

Honest cases that the rules still flag:

- A trip to Singapore or London on a device the customer already uses: airline and hotel, foreign IP.
- One electronics purchase of ₹74,600 or ₹85,600 on the usual device at home.
- Six fashion purchases in one hour, all approved, known device.
- A replacement phone at the home IP, grocery-sized.
- Two people, one household device, same surname and city, no pass-through.

## What the agent is not allowed to see

`ground_truth` (SQLite) and `labels` (in the generator output) hold `is_fraud` and the pattern name. `public_world()` strips both before flagging and investigation. `judge.json` is joined afterwards for the results page and the "Show the planted answer" control.

## What the flagger over-calls

A payment is queued if any of these fire: five or more payments in an hour, an amount above ₹16,000 and six times the customer's median, a device not on the profile, an IP country that is not home, a device already linked to someone else, a young account and an amount of at least ₹8,000, or an Isolation Forest outlier that also has one of those shapes. The forest is fit with contamination 0.02. It adds a reason; it is not allowed to flag ordinary tickets by itself.

## What the investigator checks against

The thresholds are in paise and scale with the book. For example, card testing needs a burst median under ₹800, a takeover needs a new-device peak of at least ₹12,000, and a round amount is a whole multiple of ₹1,000 and at least ₹8,000.

## What we did not model

No chargebacks, no 3-D Secure or UPI PIN step, no real issuer or NPCI network, no multi-currency books, and no adversary who adapts to these rules. Pass-through is visible because the generator writes both sides of a transfer. A production graph would come from the ledger, not from a planted script.
