"""Seeded synthetic payments with planted fraud and honest lookalikes.

The generator writes ordinary card traffic, then injects four fraud patterns
and several legitimate cases that are easy for a blunt rule to flag. Labels
are returned beside the ledger, never inside a transaction row.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import numpy as np

from engine.textutil import iso

START = datetime(2026, 5, 1, tzinfo=timezone.utc)
END = datetime(2026, 8, 10, 20, tzinfo=timezone.utc)

FIRST_NAMES = [
    "Amina", "Jonas", "Priya", "Elena", "Marcus", "Hannah", "Leo", "Sofia",
    "Noah", "Ines", "Owen", "Maya", "Felix", "Clara", "Jonah", "Aisha",
    "Theo", "Nora", "Samir", "Ruth", "Idris", "Helen", "Pavel", "Grace",
    "Luis", "Freya", "Adrian", "Chloe", "Yusuf", "Marta", "Colin", "Leila",
    "Hugo", "Anika", "Peter", "Diana", "Karim", "Eva", "Nathan", "Iris",
]
LAST_NAMES = [
    "Ward", "Okoye", "Bennett", "Almeida", "Shah", "Moreau", "Keller", "Diaz",
    "Novak", "Ibrahim", "Walsh", "Berg", "Costa", "Rahman", "Ellis", "Sato",
    "Hughes", "Pereira", "Adler", "Mensah", "Clarke", "Fischer", "Rossi",
    "Nguyen", "Hart", "Silva", "Bauer", "Cohen", "Murphy", "Lindgren",
    "Okafor", "Petrov", "Quinn", "Hassan", "Brooks", "Vogel", "Reyes", "Khan",
]

CITIES = [
    ("London", "GB", 51.507, -0.128),
    ("Manchester", "GB", 53.480, -2.242),
    ("Edinburgh", "GB", 55.953, -3.189),
    ("Bristol", "GB", 51.455, -2.588),
    ("Chicago", "US", 41.878, -87.630),
    ("Austin", "US", 30.267, -97.743),
    ("Seattle", "US", 47.606, -122.332),
    ("Toronto", "CA", 43.653, -79.383),
    ("Dublin", "IE", 53.350, -6.260),
    ("Berlin", "DE", 52.520, 13.405),
    ("Paris", "FR", 48.857, 2.352),
    ("Madrid", "ES", 40.417, -3.704),
    ("Lisbon", "PT", 38.722, -9.139),
    ("Amsterdam", "NL", 52.367, 4.904),
    ("Singapore", "SG", 1.352, 103.820),
]

DEVICE_PROFILES = [
    ("iPhone", "iOS 18", "Safari"),
    ("Pixel 8", "Android 15", "Chrome"),
    ("MacBook", "macOS 15", "Safari"),
    ("Windows laptop", "Windows 11", "Chrome"),
    ("iPad", "iPadOS 18", "Safari"),
]

# Fixed catalogue so merchant names stay readable across regenerations.
MERCHANT_SPECS = [
    ("Harbor Grocery", "5411", "grocery", "low"),
    ("Greenmarket Co-op", "5411", "grocery", "low"),
    ("Northline Fuel", "5541", "fuel", "low"),
    ("Pylon Fuel", "5541", "fuel", "low"),
    ("Copper Kettle", "5812", "restaurant", "low"),
    ("Marlow Dining", "5812", "restaurant", "low"),
    ("Sable Coffee", "5814", "coffee", "low"),
    ("Platform Coffee", "5814", "coffee", "low"),
    ("Cityline Transit", "4111", "transit", "low"),
    ("Metro Card", "4111", "transit", "low"),
    ("Kinfolk Streaming", "4899", "streaming", "low"),
    ("Northroom Audio", "4899", "streaming", "low"),
    ("Lumen Electronics", "5732", "electronics", "medium"),
    ("Field & Wire", "5651", "fashion", "low"),
    ("Atelier Hale", "5651", "fashion", "low"),
    ("Brightair", "4511", "airline", "medium"),
    ("Coastal Air", "4511", "airline", "medium"),
    ("Staywright Hotels", "7011", "hotel", "medium"),
    ("Lantern Inns", "7011", "hotel", "medium"),
    ("Parcel Gift Cards", "5947", "gift_card", "high"),
    ("Hearth Gift Co", "5947", "gift_card", "high"),
    ("Keystone Crypto Desk", "6051", "crypto", "high"),
    ("Quarter Pharmacy", "5912", "pharmacy", "low"),
    ("Paperwhites Books", "5942", "books", "low"),
    ("Lowell Hardware", "5251", "hardware", "low"),
    ("Orchard Furniture", "5712", "furniture", "medium"),
    ("Dayrate Parking", "7523", "parking", "low"),
    ("Nimbus Cloud Apps", "5734", "digital_goods", "medium"),
]


class _Ids:
    def __init__(self) -> None:
        self._n: dict[str, int] = {}

    def next(self, prefix: str, width: int) -> str:
        self._n[prefix] = self._n.get(prefix, 0) + 1
        return f"{prefix}_{self._n[prefix]:0{width}d}"


def _ts(dt: datetime) -> int:
    return int(dt.timestamp())


def generate(seed: int = 42) -> dict:
    """Build a full synthetic ledger. `labels` and `scenarios` are ground truth."""
    rng = np.random.default_rng(seed)
    ids = _Ids()
    ip_seq = 0

    customers: list[dict] = []
    accounts: list[dict] = []
    cards: list[dict] = []
    devices: list[dict] = []
    ips: list[dict] = []
    merchants: list[dict] = []
    transactions: list[dict] = []
    labels: list[dict] = []
    scenarios: list[dict] = []
    enrollments: list[dict] = []

    def alloc_ip(city: tuple, datacenter: bool = False, vpn: bool = False) -> dict:
        nonlocal ip_seq
        ip_seq += 1
        nets = ("203.0.113", "198.51.100", "192.0.2")
        net = nets[(ip_seq // 250) % 3]
        host = (ip_seq % 250) + 1
        row = {
            "id": ids.next("ip", 4),
            "address": f"{net}.{host}",
            "city": city[0],
            "country": city[1],
            "lat": city[2],
            "lon": city[3],
            "is_datacenter": datacenter,
            "is_vpn": vpn,
            "asn_label": "Example Cloud" if datacenter or vpn else "Example Broadband",
        }
        ips.append(row)
        return row

    def add_device(profile: tuple[str, str, str] | None = None) -> dict:
        picked = profile or DEVICE_PROFILES[int(rng.integers(0, len(DEVICE_PROFILES)))]
        row = {
            "id": ids.next("dev", 4),
            "hardware": picked[0],
            "os": picked[1],
            "browser": picked[2],
            "fingerprint": f"fp_{int(rng.integers(0, 16**8)):08x}",
        }
        devices.append(row)
        return row

    def enroll(customer: dict, device: dict) -> None:
        enrollments.append(
            {
                "customer_id": customer["id"],
                "device_id": device["id"],
                "enrolled_ts": customer["created_ts"],
                "enrolled_at": customer["created_at"],
                "source": "profile",
            }
        )

    def add_label(txn_id: str, is_fraud: bool, pattern: str, scenario_id: str) -> None:
        labels.append(
            {
                "transaction_id": txn_id,
                "is_fraud": int(is_fraud),
                "pattern": pattern if is_fraud else "none",
                "scenario_id": scenario_id,
            }
        )

    def add_txn(
        *,
        when: datetime,
        customer: dict,
        account: dict,
        card: dict | None,
        device: dict,
        ip: dict,
        merchant: dict | None,
        amount_cents: int,
        status: str,
        txn_type: str,
        counterparty: str | None = None,
        scenario_id: str = "organic",
        is_fraud: bool = False,
        pattern: str = "none",
    ) -> dict:
        last4 = card["last4"] if card else None
        row = {
            "id": ids.next("txn", 6),
            "ts": _ts(when),
            "occurred_at": iso(when),
            "customer_id": customer["id"],
            "account_id": account["id"],
            "card_id": card["id"] if card else None,
            "card_last4": last4,
            "device_id": device["id"],
            "ip_id": ip["id"],
            "merchant_id": merchant["id"] if merchant else None,
            "amount_cents": int(amount_cents),
            "currency": "USD",
            "status": status,
            "type": txn_type,
            "channel": "ecom" if txn_type != "p2p_out" else "transfer",
            "counterparty_account_id": counterparty,
        }
        transactions.append(row)
        add_label(row["id"], is_fraud, pattern, scenario_id)
        return row

    # Merchants. Countries are assigned from the city list so a shop has a home.
    for name, mcc, category, risk in MERCHANT_SPECS:
        city = CITIES[int(rng.integers(0, len(CITIES)))]
        merchants.append(
            {
                "id": ids.next("mer", 3),
                "name": name,
                "mcc": mcc,
                "category": category,
                "country": city[1],
                "city": city[0],
                "risk_tier": risk,
            }
        )
    collusive_city = ("Tallinn", "EE", 59.437, 24.753)
    collusive = {
        "id": ids.next("mer", 3),
        "name": "Northwind Digital Keys",
        "mcc": "5734",
        "category": "digital_goods",
        "country": "EE",
        "city": "Tallinn",
        "risk_tier": "high",
    }
    merchants.append(collusive)
    by_cat: dict[str, list[dict]] = {}
    for merchant in merchants:
        by_cat.setdefault(merchant["category"], []).append(merchant)

    def merchant_named(name: str) -> dict:
        for merchant in merchants:
            if merchant["name"] == name:
                return merchant
        raise KeyError(name)

    def any_merchant(*categories: str) -> dict:
        pool: list[dict] = []
        for category in categories:
            pool.extend(by_cat.get(category, []))
        return pool[int(rng.integers(0, len(pool)))]

    # Customers and their steady-state traffic.
    segments = ["everyday", "everyday", "everyday", "student", "affluent"]
    median_cents = {"student": 1800, "everyday": 4200, "affluent": 11000}
    daily_rate = {"student": 0.22, "everyday": 0.36, "affluent": 0.28}

    people: list[dict] = []
    for i in range(168):
        first = FIRST_NAMES[i % len(FIRST_NAMES)]
        last = LAST_NAMES[(i * 3) % len(LAST_NAMES)]
        # Spread surnames so a later household pair can share one on purpose.
        city = CITIES[i % len(CITIES)]
        segment = segments[i % len(segments)]
        opened = datetime(2019, 3, 1, tzinfo=timezone.utc) + timedelta(
            days=int(rng.integers(0, 2400))
        )
        if opened > datetime(2026, 4, 1, tzinfo=timezone.utc):
            opened = datetime(2024, 6, 15, tzinfo=timezone.utc)
        customer = {
            "id": ids.next("cus", 4),
            "name": f"{first} {last}",
            "first_name": first,
            "last_name": last,
            "email": f"{first}.{last}.{i}@example.com".lower(),
            "created_at": iso(opened),
            "created_ts": _ts(opened),
            "home_city": city[0],
            "home_country": city[1],
            "home_lat": city[2],
            "home_lon": city[3],
            "segment": segment,
        }
        account = {
            "id": ids.next("acct", 4),
            "customer_id": customer["id"],
            "opened_at": customer["created_at"],
            "opened_ts": customer["created_ts"],
            "status": "open",
        }
        card = {
            "id": ids.next("card", 4),
            "account_id": account["id"],
            "customer_id": customer["id"],
            "last4": f"{int(rng.integers(0, 10000)):04d}",
            "brand": "visa" if i % 3 else "mastercard",
            "issued_at": customer["created_at"],
        }
        primary = add_device()
        secondary = add_device()
        home_ip = alloc_ip(city)
        enroll(customer, primary)
        enroll(customer, secondary)
        mobile_city = CITIES[int(rng.integers(0, len(CITIES)))]
        while mobile_city[1] != city[1]:
            mobile_city = CITIES[int(rng.integers(0, len(CITIES)))]
        mobile_ip = alloc_ip(mobile_city)
        customers.append(customer)
        accounts.append(account)
        cards.append(card)
        people.append(
            {
                "customer": customer,
                "account": account,
                "card": card,
                "primary": primary,
                "secondary": secondary,
                "home_ip": home_ip,
                "mobile_ip": mobile_ip,
            }
        )

    def organic_for(person: dict, extra_start: datetime | None = None) -> None:
        customer = person["customer"]
        begin = START
        if extra_start:
            begin = max(begin, extra_start)
        span_days = max(1, (END - begin).days)
        rate = daily_rate[customer["segment"]]
        count = int(rng.poisson(rate * span_days))
        count = int(np.clip(count, 10, 42))
        offsets = np.sort(rng.random(count))
        med = median_cents[customer["segment"]]
        mu = math.log(med)
        for offset in offsets:
            when = begin + timedelta(seconds=float(offset) * (END - begin).total_seconds())
            amount = int(rng.lognormal(mu, 0.42))
            amount = int(np.clip(amount, 350, 32000))
            device = person["primary"] if rng.random() < 0.88 else person["secondary"]
            ip = person["home_ip"] if rng.random() < 0.93 else person["mobile_ip"]
            merchant = any_merchant(
                "grocery", "fuel", "restaurant", "coffee", "transit",
                "streaming", "pharmacy", "books", "hardware", "parking", "fashion",
            )
            status = "declined" if rng.random() < 0.02 else "approved"
            add_txn(
                when=when,
                customer=customer,
                account=person["account"],
                card=person["card"],
                device=device,
                ip=ip,
                merchant=merchant,
                amount_cents=amount,
                status=status,
                txn_type="card_purchase",
            )

    for person in people:
        organic_for(person)

    # Reserve specific people for scripted scenarios so they stay easy to find.
    traveler_people = [people[4], people[11]]
    big_people = [people[7], people[18]]
    flash_person = people[21]
    phone_people = [people[2], people[15]]
    household_a = people[8]
    # Household partner is created explicitly so the shared surname is real.
    household_last = household_a["customer"]["last_name"]
    household_city = (
        household_a["customer"]["home_city"],
        household_a["customer"]["home_country"],
        household_a["customer"]["home_lat"],
        household_a["customer"]["home_lon"],
    )

    def make_person(
        first: str,
        last: str,
        city: tuple,
        segment: str,
        opened: datetime,
    ) -> dict:
        customer = {
            "id": ids.next("cus", 4),
            "name": f"{first} {last}",
            "first_name": first,
            "last_name": last,
            "email": f"{first}.{last}.planted@example.com".lower(),
            "created_at": iso(opened),
            "created_ts": _ts(opened),
            "home_city": city[0],
            "home_country": city[1],
            "home_lat": city[2],
            "home_lon": city[3],
            "segment": segment,
        }
        account = {
            "id": ids.next("acct", 4),
            "customer_id": customer["id"],
            "opened_at": customer["created_at"],
            "opened_ts": customer["created_ts"],
            "status": "open",
        }
        card = {
            "id": ids.next("card", 4),
            "account_id": account["id"],
            "customer_id": customer["id"],
            "last4": f"{int(rng.integers(0, 10000)):04d}",
            "brand": "visa",
            "issued_at": customer["created_at"],
        }
        primary = add_device()
        secondary = add_device()
        customers.append(customer)
        accounts.append(account)
        cards.append(card)
        enroll(customer, primary)
        enroll(customer, secondary)
        person = {
            "customer": customer,
            "account": account,
            "card": card,
            "primary": primary,
            "secondary": secondary,
            "home_ip": alloc_ip(city),
            "mobile_ip": alloc_ip(city),
        }
        return person

    def record_scenario(scenario_id: str, kind: str, pattern: str, person: dict, txn_ids: list[str], note: str) -> None:
        scenarios.append(
            {
                "id": scenario_id,
                "kind": kind,
                "expected_pattern": pattern,
                "customer_id": person["customer"]["id"],
                "customer_name": person["customer"]["name"],
                "transaction_ids": txn_ids,
                "note": note,
            }
        )

    # --- Legitimate traps ---------------------------------------------------
    trip_cities = [
        ("Lisbon", "PT", 38.722, -9.139),
        ("Berlin", "DE", 52.520, 13.405),
    ]
    for index, person in enumerate(traveler_people):
        scenario_id = f"traveler_{index + 1}"
        home = person["customer"]["home_country"]
        city = trip_cities[index]
        if city[1] == home:
            city = ("Tokyo", "JP", 35.682, 139.759)
        trip_ip = alloc_ip(city)
        start = datetime(2026, 8, 3, 9, 0, tzinfo=timezone.utc) + timedelta(days=index)
        plan = [
            (merchant_named("Brightair"), 28600),
            (merchant_named("Staywright Hotels"), 24200),
            (any_merchant("restaurant"), 6400),
            (any_merchant("transit"), 1800),
            (any_merchant("coffee"), 900),
            (merchant_named("Lantern Inns"), 19800),
        ]
        txn_ids = []
        when = start
        for merchant, amount in plan:
            when += timedelta(hours=int(rng.integers(6, 10)))
            txn = add_txn(
                when=when,
                customer=person["customer"],
                account=person["account"],
                card=person["card"],
                device=person["primary"],
                ip=trip_ip,
                merchant=merchant,
                amount_cents=amount,
                status="approved",
                txn_type="card_purchase",
                scenario_id=scenario_id,
            )
            txn_ids.append(txn["id"])
        record_scenario(
            scenario_id,
            "legit_trap",
            "legitimate",
            person,
            txn_ids,
            "Genuine trip: same phone the customer already uses, airline and hotel, foreign IP.",
        )

    for index, person in enumerate(big_people):
        scenario_id = f"large_purchase_{index + 1}"
        when = datetime(2026, 8, 6, 16, 20, tzinfo=timezone.utc) + timedelta(days=index, hours=3)
        amount = 214000 if index == 0 else 186500
        txn = add_txn(
            when=when,
            customer=person["customer"],
            account=person["account"],
            card=person["card"],
            device=person["primary"],
            ip=person["home_ip"],
            merchant=merchant_named("Lumen Electronics"),
            amount_cents=amount,
            status="approved",
            txn_type="card_purchase",
            scenario_id=scenario_id,
        )
        record_scenario(
            scenario_id,
            "legit_trap",
            "legitimate",
            person,
            [txn["id"]],
            "One large electronics purchase on the usual device at home.",
        )

    sale_ids = []
    when = datetime(2026, 8, 7, 11, 5, tzinfo=timezone.utc)
    for _ in range(6):
        when += timedelta(minutes=int(rng.integers(4, 8)))
        txn = add_txn(
            when=when,
            customer=flash_person["customer"],
            account=flash_person["account"],
            card=flash_person["card"],
            device=flash_person["primary"],
            ip=flash_person["home_ip"],
            merchant=merchant_named("Field & Wire") if rng.random() < 0.5 else merchant_named("Atelier Hale"),
            amount_cents=int(rng.integers(2800, 6200)),
            status="approved",
            txn_type="card_purchase",
            scenario_id="flash_sale_1",
        )
        sale_ids.append(txn["id"])
    record_scenario(
        "flash_sale_1",
        "legit_trap",
        "legitimate",
        flash_person,
        sale_ids,
        "Six full-price fashion purchases in one lunch hour. No declines, known device.",
    )

    for index, person in enumerate(phone_people):
        scenario_id = f"new_phone_{index + 1}"
        phone = add_device(("iPhone", "iOS 18", "Safari"))
        when = datetime(2026, 8, 5, 18, 40, tzinfo=timezone.utc) + timedelta(days=index)
        txn = add_txn(
            when=when,
            customer=person["customer"],
            account=person["account"],
            card=person["card"],
            device=phone,
            ip=person["home_ip"],
            merchant=any_merchant("grocery"),
            amount_cents=3400 + index * 250,
            status="approved",
            txn_type="card_purchase",
            scenario_id=scenario_id,
        )
        record_scenario(
            scenario_id,
            "legit_trap",
            "legitimate",
            person,
            [txn["id"]],
            "Replacement phone at the home IP, grocery spend inside the baseline.",
        )

    partner = make_person(
        "Ruth",
        household_last,
        household_city,
        "everyday",
        datetime(2021, 4, 12, tzinfo=timezone.utc),
    )
    # Partner's own history uses a personal phone; one grocery run uses the shared iPad.
    partner["primary"] = add_device()
    enroll(partner["customer"], partner["primary"])
    organic_for(partner)
    shared_ipad = household_a["secondary"]
    when = datetime(2026, 8, 8, 10, 15, tzinfo=timezone.utc)
    household_txn = add_txn(
        when=when,
        customer=partner["customer"],
        account=partner["account"],
        card=partner["card"],
        device=shared_ipad,
        ip=partner["home_ip"],
        merchant=any_merchant("grocery"),
        amount_cents=6400,
        status="approved",
        txn_type="card_purchase",
        scenario_id="household_1",
    )
    record_scenario(
        "household_1",
        "legit_trap",
        "legitimate",
        partner,
        [household_txn["id"]],
        "Two people, one household iPad, same surname and city, no money passing through.",
    )

    # --- Card testing -------------------------------------------------------
    victims = [people[30], people[44], people[58]]
    probe_pool = [
        merchant_named("Parcel Gift Cards"),
        merchant_named("Hearth Gift Co"),
        merchant_named("Nimbus Cloud Apps"),
        merchant_named("Sable Coffee"),
        merchant_named("Kinfolk Streaming"),
        merchant_named("Dayrate Parking"),
        merchant_named("Paperwhites Books"),
        merchant_named("Quarter Pharmacy"),
    ]
    for index, person in enumerate(victims):
        scenario_id = f"card_testing_{index + 1}"
        attacker_device = add_device(("Windows laptop", "Windows 11", "Chrome"))
        remote = ("Ashburn", "US", 39.043, -77.488) if person["customer"]["home_country"] != "US" else ("Frankfurt", "DE", 50.110, 8.682)
        attack_ip = alloc_ip(remote, datacenter=True)
        when = datetime(2026, 8, 2, 2, 8, tzinfo=timezone.utc) + timedelta(days=index * 2, minutes=17)
        txn_ids = []
        attempts = 12 + index
        for attempt in range(attempts):
            when += timedelta(minutes=int(rng.integers(1, 3)))
            small = int(rng.integers(50, 499))
            declined = attempt < attempts - 4
            txn = add_txn(
                when=when,
                customer=person["customer"],
                account=person["account"],
                card=person["card"],
                device=attacker_device,
                ip=attack_ip,
                merchant=probe_pool[(attempt + index) % len(probe_pool)],
                amount_cents=small,
                status="declined" if declined else "approved",
                txn_type="card_purchase",
                scenario_id=scenario_id,
                is_fraud=True,
                pattern="card_testing",
            )
            txn_ids.append(txn["id"])
        when += timedelta(minutes=3)
        landed = add_txn(
            when=when,
            customer=person["customer"],
            account=person["account"],
            card=person["card"],
            device=attacker_device,
            ip=attack_ip,
            merchant=merchant_named("Parcel Gift Cards"),
            amount_cents=18600 + index * 2400,
            status="approved",
            txn_type="card_purchase",
            scenario_id=scenario_id,
            is_fraud=True,
            pattern="card_testing",
        )
        txn_ids.append(landed["id"])
        record_scenario(
            scenario_id,
            "fraud",
            "card_testing",
            person,
            txn_ids,
            "Small authorizations across many merchants, then one larger gift-card charge.",
        )

    # --- Account takeover ---------------------------------------------------
    ato_people = [people[33], people[47], people[61]]
    ato_cities = [
        ("Lagos", "NG", 6.524, 3.379),
        ("Sao Paulo", "BR", -23.551, -46.633),
        ("Dubai", "AE", 25.205, 55.271),
    ]
    ato_merchants = [
        merchant_named("Parcel Gift Cards"),
        merchant_named("Lumen Electronics"),
        merchant_named("Keystone Crypto Desk"),
        merchant_named("Hearth Gift Co"),
    ]
    ato_amounts = [42000, 89000, 26500, 64000]
    for index, person in enumerate(ato_people):
        scenario_id = f"account_takeover_{index + 1}"
        stranger = add_device(("Pixel 8", "Android 15", "Chrome"))
        city = ato_cities[index]
        if city[1] == person["customer"]["home_country"]:
            city = ("Nairobi", "KE", -1.292, 36.822)
        vpn_ip = alloc_ip(city, vpn=True)
        when = datetime(2026, 8, 4, 20, 10, tzinfo=timezone.utc) + timedelta(days=index)
        txn_ids = []
        for step, amount in enumerate(ato_amounts):
            when += timedelta(minutes=int(rng.integers(8, 20)))
            txn = add_txn(
                when=when,
                customer=person["customer"],
                account=person["account"],
                card=person["card"],
                device=stranger,
                ip=vpn_ip,
                merchant=ato_merchants[(step + index) % len(ato_merchants)],
                amount_cents=amount + index * 1500,
                status="approved",
                txn_type="card_purchase",
                scenario_id=scenario_id,
                is_fraud=True,
                pattern="account_takeover",
            )
            txn_ids.append(txn["id"])
        record_scenario(
            scenario_id,
            "fraud",
            "account_takeover",
            person,
            txn_ids,
            "New device, VPN in a country the customer has never used, gift cards and crypto.",
        )

    # --- Mule chains --------------------------------------------------------
    def plant_mule_ring(index: int, sources: list[dict]) -> None:
        scenario_id = f"mule_ring_{index + 1}"
        opened = datetime(2026, 7, 22, tzinfo=timezone.utc) + timedelta(days=index)
        city = CITIES[20 % len(CITIES)] if index == 0 else CITIES[3]
        shared = add_device(("Windows laptop", "Windows 11", "Chrome"))
        spare = add_device(("Pixel 8", "Android 15", "Chrome"))
        mule_people = []
        for mule_index, first in enumerate(("Idris", "Nora", "Pavel") if index == 0 else ("Leila", "Hugo", "Anika")):
            mule = make_person(first, LAST_NAMES[(40 + index * 3 + mule_index) % len(LAST_NAMES)], city, "student", opened)
            mule["primary"] = shared if mule_index < 2 else spare
            enroll(mule["customer"], mule["primary"])
            mule["home_ip"] = alloc_ip(city, datacenter=True)
            mule_people.append(mule)
            # Camouflage uses a private phone. The shared laptop appears only on the fraud flow,
            # so a $5 coffee is not itself queued as a mule payment.
            camouflage_device = add_device(("iPhone", "iOS 18", "Safari"))
            enroll(mule["customer"], camouflage_device)
            camouflage_at = opened + timedelta(days=2, hours=4 + mule_index)
            add_txn(
                when=camouflage_at,
                customer=mule["customer"],
                account=mule["account"],
                card=mule["card"],
                device=camouflage_device,
                ip=mule["home_ip"],
                merchant=any_merchant("coffee"),
                amount_cents=450 + mule_index * 50,
                status="approved",
                txn_type="card_purchase",
                scenario_id=scenario_id,
            )
        flow_at = datetime(2026, 8, 8, 13, 0, tzinfo=timezone.utc) + timedelta(days=index)
        amounts = [120000, 80000] if index == 0 else [96000, 142000]
        ring_txn_ids: dict[str, list[str]] = {p["customer"]["id"]: [] for p in sources}
        for mule in mule_people:
            ring_txn_ids[mule["customer"]["id"]] = []

        def p2p(src: dict, dst: dict, amount: int, when: datetime, device: dict | None = None) -> None:
            out = add_txn(
                when=when,
                customer=src["customer"],
                account=src["account"],
                card=src["card"],
                device=device or src["primary"],
                ip=src["home_ip"],
                merchant=None,
                amount_cents=amount,
                status="approved",
                txn_type="p2p_out",
                counterparty=dst["account"]["id"],
                scenario_id=scenario_id,
                is_fraud=True,
                pattern="mule_chain",
            )
            inn = add_txn(
                when=when + timedelta(seconds=8),
                customer=dst["customer"],
                account=dst["account"],
                card=None,
                device=dst["primary"],
                ip=dst["home_ip"],
                merchant=None,
                amount_cents=amount,
                status="approved",
                txn_type="p2p_in",
                counterparty=src["account"]["id"],
                scenario_id=scenario_id,
                is_fraud=True,
                pattern="mule_chain",
            )
            ring_txn_ids[src["customer"]["id"]].append(out["id"])
            ring_txn_ids[dst["customer"]["id"]].append(inn["id"])

        p2p(sources[0], mule_people[0], amounts[0], flow_at)
        p2p(sources[1], mule_people[0], amounts[1], flow_at + timedelta(minutes=22))
        passed = int((amounts[0] + amounts[1]) * 0.94)
        p2p(mule_people[0], mule_people[1], passed, flow_at + timedelta(hours=2, minutes=10), mule_people[0]["primary"])
        cash_amount = int(passed * 0.96)
        cash = add_txn(
            when=flow_at + timedelta(hours=3, minutes=5),
            customer=mule_people[1]["customer"],
            account=mule_people[1]["account"],
            card=mule_people[1]["card"],
            device=mule_people[1]["primary"],
            ip=mule_people[1]["home_ip"],
            merchant=merchant_named("Keystone Crypto Desk"),
            amount_cents=cash_amount,
            status="approved",
            txn_type="cash_out",
            scenario_id=scenario_id,
            is_fraud=True,
            pattern="mule_chain",
        )
        ring_txn_ids[mule_people[1]["customer"]["id"]].append(cash["id"])
        # Third mule shares the device on a smaller pass-through the next morning,
        # so the link is visible even if an analyst opens that account.
        morning = flow_at + timedelta(hours=18)
        p2p(mule_people[1], mule_people[2], 40000, morning, mule_people[1]["primary"])
        side = add_txn(
            when=morning + timedelta(hours=1),
            customer=mule_people[2]["customer"],
            account=mule_people[2]["account"],
            card=mule_people[2]["card"],
            device=mule_people[2]["primary"],
            ip=mule_people[2]["home_ip"],
            merchant=merchant_named("Keystone Crypto Desk"),
            amount_cents=38000,
            status="approved",
            txn_type="cash_out",
            scenario_id=scenario_id,
            is_fraud=True,
            pattern="mule_chain",
        )
        ring_txn_ids[mule_people[2]["customer"]["id"]].append(side["id"])

        for person in sources:
            record_scenario(
                scenario_id,
                "fraud",
                "mule_chain",
                person,
                ring_txn_ids[person["customer"]["id"]],
                "Established account pushes funds into a mule chain that cashes out the same day.",
            )
        for mule in mule_people:
            record_scenario(
                f"{scenario_id}_{mule['customer']['id']}",
                "fraud",
                "mule_chain",
                mule,
                ring_txn_ids[mule["customer"]["id"]],
                "Young account, shared device, inbound funds leave within hours.",
            )

    plant_mule_ring(0, [people[70], people[71]])
    plant_mule_ring(1, [people[80], people[81]])

    # --- Merchant collusion -------------------------------------------------
    collusion_device_a = add_device(("Windows laptop", "Windows 11", "Chrome"))
    collusion_device_b = add_device(("MacBook", "macOS 15", "Safari"))
    collusion_opened = datetime(2026, 7, 18, tzinfo=timezone.utc)
    collusion_city = ("Tallinn", "EE", 59.437, 24.753)
    for index, first in enumerate(("Colin", "Diana", "Karim", "Eva", "Nathan", "Iris")):
        person = make_person(
            first,
            LAST_NAMES[(12 + index * 5) % len(LAST_NAMES)],
            collusion_city,
            "student",
            collusion_opened + timedelta(days=index % 3),
        )
        person["primary"] = collusion_device_a if index < 3 else collusion_device_b
        enroll(person["customer"], person["primary"])
        person["home_ip"] = alloc_ip(collusion_city, datacenter=True)
        scenario_id = "merchant_collusion_1"
        txn_ids = []
        # A private phone for the small coffee, so the shared laptop is the collusion signal.
        coffee_device = add_device(("Pixel 8", "Android 15", "Chrome"))
        enroll(person["customer"], coffee_device)
        add_txn(
            when=collusion_opened + timedelta(days=3, hours=index),
            customer=person["customer"],
            account=person["account"],
            card=person["card"],
            device=coffee_device,
            ip=person["home_ip"],
            merchant=any_merchant("coffee"),
            amount_cents=600,
            status="approved",
            txn_type="card_purchase",
            scenario_id=scenario_id,
        )
        # One afternoon of round amounts so the four payments cluster into a single case.
        base = datetime(2026, 8, 3, 10, 0, tzinfo=timezone.utc) + timedelta(days=index)
        for step in range(4):
            amount = 50000 if step % 2 == 0 else 25000
            txn = add_txn(
                when=base + timedelta(hours=step * 2),
                customer=person["customer"],
                account=person["account"],
                card=person["card"],
                device=person["primary"],
                ip=person["home_ip"],
                merchant=collusive,
                amount_cents=amount,
                status="approved",
                txn_type="card_purchase",
                scenario_id=scenario_id,
                is_fraud=True,
                pattern="merchant_collusion",
            )
            txn_ids.append(txn["id"])
        record_scenario(
            f"{scenario_id}_{person['customer']['id']}",
            "fraud",
            "merchant_collusion",
            person,
            txn_ids,
            "Round amounts at one merchant, young accounts, two devices shared across the buyers.",
        )

    transactions.sort(key=lambda row: (row["ts"], row["id"]))
    labels.sort(key=lambda row: row["transaction_id"])

    return {
        "customers": customers,
        "accounts": accounts,
        "cards": cards,
        "devices": devices,
        "ips": ips,
        "merchants": merchants,
        "transactions": transactions,
        "enrollments": enrollments,
        "labels": labels,
        "scenarios": scenarios,
        "meta": {
            "seed": seed,
            "currency": "USD",
            "window_start": iso(START),
            "window_end": iso(END),
            "generator": "engine.generate",
            "version": "1.0.0",
        },
    }


def public_world(world: dict) -> dict:
    """Drop ground truth. This is the only view the agent is allowed to take."""
    keep = ("customers", "accounts", "cards", "devices", "ips", "merchants", "transactions", "enrollments", "meta")
    return {key: world[key] for key in keep}
