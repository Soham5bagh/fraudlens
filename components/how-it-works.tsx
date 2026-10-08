const STEPS = [
  {
    title: "A payment gets flagged",
    body: "A basic rule queue spots something unusual: too many payments, a new device, a foreign location, a large amount.",
    icon: FlagIcon,
  },
  {
    title: "Halden gathers evidence",
    body: "It reads the customer's history, the device, the location, the merchant, and where the money went.",
    icon: SearchIcon,
  },
  {
    title: "It explains the case",
    body: "It names the pattern in plain language and gives a risk score from 0 to 100, with the numbers behind it.",
    icon: ScoreIcon,
  },
  {
    title: "A person decides",
    body: "You approve, hold, escalate, or block. Halden never presses the button.",
    icon: PersonIcon,
  },
];

export function HowItWorks() {
  return (
    <section className="how" aria-labelledby="how-heading">
      <h2 id="how-heading">How it works</h2>
      <ol>
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <step.icon />
            <strong>
              {index + 1}. {step.title}
            </strong>
            <span>{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FlagIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M7 4.5v19M7 6h12l-2.2 4.2L19 14.5H7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="12.5" cy="12.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17.5 17.5L23 23" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ScoreIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M6 20.5h16M8 20.5V15M13 20.5V10M18 20.5V7.5M22 20.5v-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 22.5c1.2-3.4 3.5-5 6.5-5s5.3 1.6 6.5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
