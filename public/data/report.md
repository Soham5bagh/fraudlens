# Halden detection report

The flagger queued 117 payments, catching 100% of fraud transactions and also pulling in 8 genuine customers. Halden, reviewing only that queue, caught 100% of fraud transactions at 100% precision and would have blocked 0 genuine customers. It cleared 8 genuine customers the queue would otherwise have stopped.

Seed `42`, window 2026-05-01T00:00:00Z to 2026-08-10T20:00:00Z.

## Population

- Transactions: 5346
- Fraud transactions: 98
- Legitimate transactions: 5248
- Customers: 181
- Cases in the analyst queue: 30

## Naive flagger vs Halden

| | Frauds caught (recall) | Precision | False positive rate | False alarms (payments) | Genuine customers blocked |
| --- | --- | --- | --- | --- | --- |
| Rubber-stamp the queue | 100.0% | 83.8% | 0.36% | 19 | 8 |
| Follow Halden | 100.0% | 100.0% | 0.00% | 0 | 0 |

Caught means the suggested action is hold, escalate, or block. Genuine customers blocked counts people who have no fraudulent payments at all.

### Confusion matrix (transaction level)

| Halden | Predicted legitimate | Predicted fraud |
| --- | --- | --- |
| Actually legitimate | 5248 | 0 |
| Actually fraud | 0 | 98 |

| Naive queue | Predicted legitimate | Predicted fraud |
| --- | --- | --- |
| Actually legitimate | 5229 | 19 |
| Actually fraud | 0 | 98 |

## By pattern

| Pattern | Fraud payments | Caught by Halden | Recall | Cases named correctly |
| --- | --- | --- | --- | --- |
| Card testing | 42 | 42 | 100% | 3 / 3 |
| Account takeover | 12 | 12 | 100% | 3 / 3 |
| Mule-account chain | 20 | 20 | 100% | 10 / 10 |
| Merchant collusion | 24 | 24 | 100% | 6 / 6 |

## Queue composition

- Fraud cases caught: 22 / 22
- Fraud cases named as the right pattern: 22 / 22
- Legitimate cases approved: 8 / 8

### Genuine customers the queue would have stopped, and Halden cleared

- Priya Keller (cus_0003), 1 queued payments
- Marcus Costa (cus_0005), 6 queued payments
- Sofia Fischer (cus_0008), 1 queued payments
- Maya Hassan (cus_0012), 6 queued payments
- Aisha Diaz (cus_0016), 1 queued payments
- Samir Hughes (cus_0019), 1 queued payments
- Helen Silva (cus_0022), 2 queued payments
- Ruth Hart (cus_0169), 1 queued payments

## How to read this

The flagger is a wide net: velocity, amount, new device, foreign IP, shared device, young accounts, and an Isolation Forest. Halden re-investigates each case with history, a money-flow graph, and merchant checks, then suggests an action. It never blocks anyone by itself.
