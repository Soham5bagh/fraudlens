# Pitch script (about four minutes)

Halden investigates a flagged payment and stops before it acts. A person still approves, holds, escalates, or blocks.

**Open on the queue.** "This desk had 5,346 payments. Ninety-eight were fraud we planted: card testing, account takeover, mule chains, and a merchant ring. A normal flagger — velocity, amount, new device, foreign IP, shared device, young accounts, plus an Isolation Forest — caught all 98. It also queued eight genuine customers. If the analyst rubber-stamps the queue, those eight are blocked."

**Demo 1 — card testing, Colin Ellis.** "Thirteen attempts in eighteen minutes, eight of them declined, median under three dollars, then $186 at a gift-card shop. The device is not on his profile. The IP is a datacenter in Ashburn; he lives in Britain. Halden says block, score 94. I am not pressing block. I am recording that a person agreed."

**Demo 2 — account takeover, Anika Nguyen.** "New phone, new country, VPN, gift cards and crypto at about 56 times her median. This is the pattern people confuse with travel. Hold that thought."

**Demo 3 — mule chain, Idris Bennett.** "Don't stare at one amount. The graph shows the money: into a young account, out the same day, shared laptop, cash-out at a crypto desk. Halden says escalate, because freezing one account leaves the chain."

**Optional — merchant collusion, Colin Costa.** "Round $250 and $500 charges, one merchant, buyers who share a laptop. Escalating a single card does not fix the merchant."

**Demo 5 — Marcus Costa, the genuine trip.** "He was queued for a foreign IP. Same phone he has used for months. Airline and hotel. Halden says approve, score 16. The queue would have blocked him. That is the false alarm."

**Metrics.** "Same frauds caught: 100% recall. Precision moves from 84% to 100%. False alarms from 19 payments to zero. Genuine customers blocked: 8 versus 0. The label was not in the file the agent read. You can reveal it on the case."

**Live, thirty seconds.** "The queue was precomputed. This one is not. Investigate, card testing, new payment. Watch the checks land: history, a burst of declines, a new device, a datacenter IP. Then the score and block. I still have to press it. Only after I record the decision does the page admit what was planted. Change the seed in the URL and the file changes. Same seed, same file."

**Close.** "The agent explains itself with the payment ids, the device, and the amounts. The analyst decides. Nothing in this demo called a model, and nothing here needs an API key."
