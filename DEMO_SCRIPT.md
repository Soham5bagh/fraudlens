# Pitch script (about four minutes)

FraudLens investigates a flagged payment and stops before it acts. A person still approves, holds, escalates, or blocks.

**Open on the queue.** "This desk had 5,459 payments from customers across India, in rupees. Ninety-eight were fraud we planted: card testing, account takeover, mule chains, and a merchant ring. A normal flagger — velocity, amount, new device, foreign IP, shared device, young accounts, plus an Isolation Forest — caught all 98. It also queued eight genuine customers. If the analyst rubber-stamps the queue, those eight are blocked."

**Demo 1 — card testing, Debashish Mukherjee.** "Thirteen attempts in twenty minutes, eight of them declined, median under ninety rupees, then ₹7,440 at a gift-card shop. The Windows laptop is not on his profile. The IP is a datacenter in Ashburn; he lives in Mumbai. FraudLens says block, score 94. I am not pressing block. I am recording that a person agreed."

**Demo 2 — account takeover, Jaspreet Bedi.** "New Android phone, a VPN in Lagos, gift cards, electronics, and crypto at about 54 times the usual median. This is the pattern people confuse with travel. Hold that thought."

**Demo 3 — mule chain, Imran Qureshi.** "Don't stare at one amount. The graph shows the money: ₹80,000 in by UPI, ₹75,200 out the same evening, a laptop shared with Sravya Goud, and a cash-out at a crypto exchange. FraudLens says escalate, because freezing one account leaves the chain."

**Optional — merchant collusion, Chirag Malhotra.** "Round ₹10,000 and ₹20,000 charges at one Gurugram merchant, six young buyers who share two laptops. Escalating a single card does not fix the merchant."

**Demo 5 — Faisal Khan, the genuine trip.** "He was queued for a Singapore IP. Same laptop he has used for months. Airline and hotels. FraudLens says approve, score 16. The queue would have blocked him. That is the false alarm."

**Results.** "Same frauds caught: 98 of 98. Precision moves from 83.76% to 98.99%. False alarms from 19 payments to one. Genuine customers blocked: 8 versus 0. The one false alarm is honest: a ₹798 bookshop purchase that sat inside a mule-chain case on the same account. The label was not in the file the agent read. You can reveal it on the case."

**Live, thirty seconds.** "The queue was precomputed. This one is not. Investigate live, card testing, new payment. Watch the checks land: history, a burst of declines, a new device, a datacenter IP. Then the score and block. I still have to press it. Only after I record the decision does the page admit what was planted. Change the seed in the URL and the file changes. Same seed, same file."

**Close.** "Each check is a node in a LangGraph graph, in Python for the queue and in the browser for the live file. The agent explains itself with the payment ids, the device, and the amounts. The analyst decides. Nothing in this demo called a model, and nothing here needs an API key."
