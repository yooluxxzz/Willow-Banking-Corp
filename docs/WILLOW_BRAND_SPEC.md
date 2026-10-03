# Willow — Brand, Design System and Experience Specification

Willow is a fictional digital bank, investment platform and financial-intelligence app built as a software demonstration. This document describes the brand, the design system in `public/css/willow.css`, and the rules every screen follows. Nothing in Willow moves real money; the interface says so wherever it matters.

## 1. Brand

| | |
| --- | --- |
| **Name** | Willow (legal-style name in disclosures: Willow Banking Corp., fictional) |
| **Tagline** | Your money. Moving forward. |
| **Positioning** | Banking, investing and building wealth — brought together in one intelligent financial experience. |
| **Personality** | Calm, intelligent, human, confident, modern. Never loud, never hype. |
| **Feeling** | Trust, clarity, progress and control. |
| **Closing line** | Willow — your money, moving forward. |

**Voice.** Plain words, short sentences, active voice. Say what happens and what doesn’t (“Simulated — no real money moved.”). Numbers are exact or clearly labelled as estimates. No exclamation marks in product copy, no urgency tricks, no unverifiable claims (no awards, certifications, insurance, regulators or “bank-grade” language).

**Honesty labels** used everywhere:

| Label | Meaning |
| --- | --- |
| `Demo` badge | A feature that behaves like a real product but uses simulated money. |
| `Simulated` tag | An action (payment, trade, conversion, verification) that only updates Willow’s records. |
| Delayed / Cached | Third-party market data; prices are never invented. |
| Indicative | Exchange rates and illustrations, not executable quotes. |
| Estimate | Loan and savings calculator outputs — not offers. |
| Illustrative | Sample imagery or figures on public pages. |

## 2. Color

All colors are CSS custom properties on `:root`, with a full dark theme under `[data-theme="dark"]` (set from the saved preference or `prefers-color-scheme`). Components use **semantic roles** (`--bg`, `--surface`, `--text`, `--text-secondary`, `--text-muted`, `--border`, `--brand`, `--accent`, `--link`, `--focus`), never raw palette values.

| Palette | Key values | Use |
| --- | --- | --- |
| Forest | `#0D2219` (900) · `#1D4836` (700) · `#275E48` (600) | Brand, primary actions, balance hero, navigation |
| Sage | `#A8C7B2` (300) · `#E5EFE8` (100) · `#F1F6F2` (50) | Soft fills, selected states, icon tiles |
| Copper | `#B9653E` (500) · `#D2875F` (400) · `#F6E7DD` (100) | The single accent: progress, current step, highlights, demo badge |
| Ivory | `#F5F3ED` (100, page) · `#FBFAF7` (50) · `#FFFFFF` (surface) | Backgrounds and surfaces |
| Ink | `#0E1B16` → `#5F6C66` | Text hierarchy |
| Status | positive `#13744A`, negative `#B3322C`, warning `#8F5B00`, info `#2C5A80` (each with a soft tint) | Gains/losses, alerts, states |
| Charts | eight-step palette `--chart-1…8` starting forest, sage, copper | Data visualisation; colorblind-safe pairings for in/out |

Rules: one accent per view; gains are green and losses red **and** carry a sign (+/−) so color is never the only signal; text meets WCAG AA contrast in both themes.

## 3. Typography

* **Typeface:** Mona Sans (variable, self-hosted WOFF2 in `public/fonts/`, Latin + Latin Extended subsets, SIL OFL). Width axis is used sparingly: display text slightly condensed (`--stretch-display: 92%`), headings 96%.
* **Numbers:** always tabular (`.num`, `.figure`) so balances align; currency symbols are part of the figure; minus is the true minus sign “−”.
* **Scale:** `--fs-2xs` 11px → `--fs-6xl` (fluid, ~108px). Body 16px, line height 1.55–1.75 for prose.
* **Hierarchy:** eyebrow label (uppercase, tracked, 11–12px) → headline (tight tracking −0.035em) → lede (secondary color) → body.

## 4. Space, shape and depth

* Spacing tokens `--s-1` (4px) … `--s-12` (48px) plus fluid section padding.
* Radius scale: `--r-sm` 10 · `--r-md` 14 · `--r-lg` 20 · `--r-xl` 28 · `--r-2xl` 36 · pills.
* Elevation: three soft shadows (`--shadow-sm/md/lg`) tinted with forest; dark theme uses deeper shadows plus hairline borders.
* Iconography: a single stroke icon set (`public/images/icons.svg`, 1.75px strokes, rounded caps) referenced with `<use>`; icon tiles hold icons on sage.

## 5. Components (in `willow.css` and `app.css`)

Buttons (primary, secondary, ghost, light/outline-light on dark, danger; small/large/icon/block; loading state), badges and the demo badge, chips, deltas, cards and panels, form fields (labels, help, errors, input groups, amount input), switches, segmented controls, ranges, option cards, notices (info/success/warning/error/demo), disclosure notes, list rows, definition rows, tables, tabs, steppers and progress (bar and ring), skeletons, empty states, avatars, asset marks, currency flags, toasts, modal dialogs and bottom sheets (mobile), menus, bank-card mockups (forest/sage/copper/ivory/graphite, physical/virtual, frozen/inactive), charts (line, sparkline, donut, bars, columns — in-house SVG), privacy mode (`html.is-private [data-private]` blurs amounts).

## 6. Layout and navigation

* **Public site:** demo strip → header with mega menus (Money, Wealth, Borrow, Business, Explore) and Sign in / Open an account; full-screen mobile navigation with grouped disclosure sections; editorial footer with disclosures.
* **Signed-in app:** left sidebar (Home, Your picture — Net worth, Budgets, Debts — Money, Wealth, Plan & borrow, Business, Security/Settings/Help) on desktop; top bar with “Ask Willow” (⌘K, shown only when a local Ollama model is reachable), privacy toggle, theme, notifications and profile menu; on tablet/mobile a bottom tab bar (Home, Money, Pay, Wealth, More sheet). Page titles carry the matching sidebar symbol.
* Grids: `layout-main-aside`, `layout-halves`, `layout-thirds`; content max width 1240px; 16–24px mobile gutters; no horizontal page scroll.

## 7. Motion

* Durations `--dur-1…4` (120–560ms) and a cinematic 1.8s crossfade for hero imagery; easing `--ease-out` for entrances.
* Micro-interactions: button press, card hover lift, count-up balances, success check drawing, flow-step fades, shake on invalid sign-in.
* Attention: key figures and new results fade in, hold a soft copper glow and fade back out over about 2.4 seconds (`W.highlight`, `[data-attention]`); lists and cards enter with a short stagger (`W.stagger`).
* Scroll focus: every section fades up the first time it is scrolled to, then gets a moment of focus that fades in and out. Public sections get a soft copper wash with a glowing heading, or a glow on their first cards when they have no heading. App cards get the copper ring. What is on screen at load only fades in, no more than three glows play at once, and each section does this once per visit (`setupAttention` in `app.js`).
* `prefers-reduced-motion` removes autoplay, drift, count-ups, attention glows, scroll focus and transitions (instant state changes); the hero shows a still scene and its play button is disabled.

## 8. Imagery

Warm, natural-light photography of real-life moments (everyday life, home, a small business, travel, planning for the future), always under a forest-tinted scrim for legible white type. Two portraits are served locally; others load from Unsplash with gradient fallbacks so the layout never breaks if images are blocked. Interface “vignettes” over photos are labelled **Illustrative**.

## 9. Key experiences

* **Homepage:** five-scene crossfading hero (“For everyday life.” → “For what you’re building.” → “For what’s next.”), autoplay with pause on hover/focus/interaction and when hidden, scene tabs, then Everyday banking, Grow your money (live delayed market panel), “What are you working toward?” goal picker, Net worth, Security, and “Where will your money take you?”.
* **Sign in:** split screen with fading imagery; Email or customer ID; states for loading, incorrect password (with attempts left), paused (locked), suspended, session timeout, signed out and password reset; other methods (guest profile, recovery code, customer ID); two-step verification.
* **Sign up:** six steps with progress — Welcome, About you, Account, Security, Verify (clearly **simulated** identity check), Done (customer ID and next steps).
* **Payments:** recipient → amount → account → review → confirm → success (“Money sent · $45.00 · To Lucas Moreau · Today · 2:50 PM”), with confirmation of payee and saved payees.
* **Wealth:** portfolio dashboard, markets, stock/crypto detail with 1D–MAX charts, simulated buy/sell with receipts stating “This is a simulated transaction. No real securities are purchased.”
* **Net worth:** accounts, investing and the assets and debts the customer records, as one figure with own/owe donuts, daily history, money movement, categories, investments, goals and insights. Everything starts at zero; nothing is pre-filled.
* **Budgets and debts:** daily/weekly/monthly limits measured against real activity and checked every night (and at start-up); debts with payoff estimates and payments from a Willow account or recorded from elsewhere.
* **Ask Willow:** an optional assistant that runs locally with Ollama and answers only from the customer’s own records.

## 10. Accessibility and quality bar

Semantic landmarks and headings, skip link, visible focus rings (`--ring`), labelled controls, roving tabindex for tabs and segmented controls, `aria-live` for asynchronous results, dialogs with focus management, 44px touch targets, color never the sole signal, privacy mode for shared screens, and an automated crawl that fails on broken internal links or placeholder output.
