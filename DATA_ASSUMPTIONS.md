# Data assumptions

The book is synthetic and seeded (`42`). Regenerating it with `python -m engine.build` produces the same payments, the same queue, and the same suggested actions.

## What is real enough

- **Window.** Payments from 1 May 2026 through 10 Aug 2026. The desk reviews the queue on the morning of 11 Aug, so device links and merchant history can include payments that posted later in the week. A customer's baseline is still everything before the flagged episode.
- **People.** 181 customers with a home city, a segment (student, everyday, affluent), one account, one card, and two devices enrolled on the profile at account opening. Emails are `@example.com`.
- **Money.** Amounts are USD cents. Ordinary tickets are capped around $320 so a large purchase is an exception, not noise. Peer-to-peer and cash-out exist only where a mule chain was planted.
- **Places and devices.** IP addresses are in the documentation ranges `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24` (RFC 5737). A "new device" means a device that is not on the customer's profile and has not appeared on an earlier payment. A second phone the customer already enrolled is not treated as new.
- **Merchants.** A fixed catalogue (grocery, fuel, travel, gift cards, crypto, and one collusive digital-goods merchant, Northwind Digital Keys).

## What was planted

| Pattern | What it looks like |
| --- | --- |
| Card testing | Many sub-$5 authorizations, several declines, many merchants, a device not on the profile, a datacenter IP, then one larger gift-card charge. |
| Account takeover | A new device, a VPN in a country the customer has not used, and gift-card, electronics, or crypto spend many times the baseline. |
| Mule-account chain | Young accounts, a shared laptop, inbound transfers that leave the same day, ending at Keystone Crypto Desk. |
| Merchant collusion | Six young accounts, two shared laptops, repeated $250 and $500 charges at one merchant in a single afternoon. |

Honest cases that the rules still flag:

- A trip on the customer's own phone: airline and hotel, foreign IP.
- One electronics purchase over $1,800 on the usual device at home.
- Six fashion purchases in one hour, all approved, known device.
- A replacement phone at the home IP, grocery-sized.
- Two people, one household iPad, same surname and city, no pass-through.

## What the agent is not allowed to see

`ground_truth` (SQLite) and `labels` (in the generator output) hold `is_fraud` and the pattern name. `public_world()` strips both before flagging and investigation. `judge.json` is joined afterwards for the metrics page and the "Reveal ground truth" control.

## What the flagger over-calls

A payment is queued if any of these fire: five or more payments in an hour, amount above $400 and six times the customer's median, a device not on the profile, an IP country that is not home, a device already linked to someone else, a young account and an amount of at least $200, or an Isolation Forest outlier that also has one of those shapes. The forest is fit with contamination 0.02. It adds a reason; it is not allowed to flag ordinary tickets by itself.

## What we did not model

No chargebacks, no 3-D Secure, no real issuer network, no non-USD books, and no adversary who adapts to these rules. Pass-through is visible because the generator writes both sides of a transfer. A production graph would come from the ledger, not from a planted script.
