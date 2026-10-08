# Halden — detection and false alarms

Seed 42. 5,346 payments, 181 customers, 98 fraud payments, 30 cases in the analyst queue. Labels were held out until scoring.

## The comparison that matters

Rubber-stamping the queue catches every fraud payment (recall 100%) and also stops 8 genuine customers: a traveler, another traveler, two large electronics purchases, two new phones, a fashion sale, and a household iPad. Precision on that policy is 83.8%. False alarms: 19 legitimate payments. False positive rate: 0.36%.

Halden, reading only that queue, also catches every fraud payment. Precision is 100%. False alarms: 0. Genuine customers blocked: 0. It cleared all 8 people the queue would have stopped.

Caught means the suggested action is hold, escalate, or block. Approve means the customer is left alone. The agent does not apply either outcome.

## Confusion matrices

Halden, transaction level:

|  | Predicted legitimate | Predicted fraud |
| --- | --- | --- |
| Actually legitimate | 5,248 | 0 |
| Actually fraud | 0 | 98 |

Naive queue:

|  | Predicted legitimate | Predicted fraud |
| --- | --- | --- |
| Actually legitimate | 5,229 | 19 |
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

The numbers above are what `data/seed/metrics.json` contains after that build. The Next.js metrics page reads the same file.
