# FraudLens — detection and false alarms

Seed 42. 5,459 payments, 181 customers in India, 98 fraud payments, 30 cases in the analyst queue. Amounts are in rupees. Labels were held out until scoring.

## The comparison that matters

Rubber-stamping the queue catches every fraud payment (98 of 98) and also stops 8 genuine customers: two travellers, two large electronics purchases, two new phones, a flash sale, and someone sharing a household Windows laptop. Precision on that policy is 83.76%. False alarms: 19 legitimate payments. False positive rate: 0.35%.

FraudLens, reading only that queue, also catches every fraud payment. Precision is 98.99%. False alarms: 1. Genuine customers blocked: 0. It cleared all 8 people the queue would have stopped.

The false alarm is txn_002343, a legitimate ₹798.30 purchase at Pustak Books by Suresh Iyer. His account sent ₹32,000.00 into a mule chain, and the purchase sits inside that case's time window (case_0021), so it is scored with the case. Suresh Iyer is not counted as a genuine customer, because his own transfer into the chain is fraud.

Caught means the suggested action is hold, escalate, or block. Approve means the customer is left alone. The agent does not apply either outcome.

## Confusion matrices

FraudLens, transaction level:

|  | Predicted legitimate | Predicted fraud |
| --- | --- | --- |
| Actually legitimate | 5,360 | 1 |
| Actually fraud | 0 | 98 |

Naive queue:

|  | Predicted legitimate | Predicted fraud |
| --- | --- | --- |
| Actually legitimate | 5,342 | 19 |
| Actually fraud | 0 | 98 |

## By pattern

| Pattern | Fraud payments | Caught | Cases named correctly |
| --- | --- | --- | --- |
| Card testing | 42 | 42 | 3 / 3 |
| Account takeover | 12 | 12 | 3 / 3 |
| Mule-account chain | 20 | 20 | 10 / 10 |
| Merchant collusion | 24 | 24 | 6 / 6 |

Of the 30 cases, 22 are fraud and 8 are legitimate. All 22 fraud cases are named as the right pattern. All 8 legitimate cases are approved. Suggested actions on the queue: 6 block, 16 escalate, 8 approve.

## How to reproduce

```bash
pip install -r requirements.txt
python -m engine.build
python -m pytest tests -q
npm install
npm run build
```

The numbers above are what `data/seed/metrics.json` contains after that build. The Next.js results page reads the same file.

## Other seeds

Seeds 7, 99, and 123 were not used to write the demo. Each one replants the same four patterns and the same kinds of honest traps, with different customers and amounts. The engine was not retuned to lift these scores.

| Seed | Payments | Agent recall | Agent precision | False alarms | Genuine customers blocked | Fraud cases named | Legitimate cases approved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 5,574 | 100% | 100% | 0 | 0 (queue would block 8) | 22 / 22 | 8 / 8 |
| 99 | 5,525 | 100% | 100% | 0 | 0 (queue would block 8) | 22 / 22 | 8 / 8 |
| 123 | 5,536 | 100% | 100% | 0 | 0 (queue would block 8) | 22 / 22 | 8 / 8 |

No genuine customer is blocked on any of the three seeds. All four patterns are named in full on each seed.

High scores are expected: the fraud is planted with sharp signatures, and the honest traps are planted too. This is not a claim about a live payments book. A normal purchase can also fall inside an attack's time window and be counted with it, as it does once on seed 42. The agent never sees the labels. Production fraud is fuzzier, and these checks would need to be retuned on real outcomes.
