# Willow Banking Corp. Brand and UX Specification

## Brand

**Brand concept:** A steady, human banking partner for the routines and plans that shape a person's life. Willow suggests resilience and considered growth without turning the identity into a botanical theme.

**Primary slogan:** Steady for what's next.

**Supporting statement:** Everyday accounts, cards, transfers and clear digital tools, brought together around the life you're building.

**Short brand message:** A clear place for money, through every kind of day.

**Personality:** Calm, capable, warm, clear, grounded and quietly contemporary. Willow is direct about what it offers and candid about what still needs to be verified.

**Brand promise:** Help people see and manage everyday money with more context, while keeping the experience straightforward and human.

**Keywords:** Steady, considered, clear, human, capable, connected, growing.

## Visual Identity

### Color

| Role | Color | Use |
| --- | --- | --- |
| Primary forest | `#203F36` | Brand actions, links and headings |
| Deep forest | `#18342E` | Utility bar, trust band and image overlay |
| Soft sage | `#78897B` | Supporting accents and secondary surfaces |
| Pale sage | `#E7ECE5` | Product icon fields and experience section |
| Paper | `#F4F5F0` | Page background and editorial bands |
| Surface | `#FFFFFF` | Product grid and interface mockup |
| Primary text | `#202B27` | Headlines and body copy |
| Secondary text | `#5F6B65` | Supporting copy and labels |
| Border | `#DCE2DB` | Dividers and control outlines |
| Copper accent | `#B96345` | Small emphasis and active states |
| Success | `#41765A` | Positive status |
| Warning | `#9B6B2A` | Caution status |
| Error | `#A74B43` | Error status |

The palette balances forest green with mineral sage, paper neutrals and a restrained copper accent. Use the dark theme tokens as documented in the page stylesheet; do not turn every surface green.

### Typography

| Style | Typeface | Size and weight | Line height |
| --- | --- | --- | --- |
| Display | Newsreader | H1 68px/500 desktop, 42px/500 small mobile; H2 46px/500 desktop, 38px/500 mobile | 1.02-1.12 |
| Interface and body | DM Sans | Body 16px/400; lead 18px/400; H3 25px/500; small 12-14px/400-600 | 1.5-1.75 |
| Data | JetBrains Mono | 12-14px/400-500 when numeric alignment matters | 1.4 |
| Buttons and navigation | DM Sans | 14-15px/600-700 | 1.3 |

Keep letter spacing at 0. Change type size at responsive breakpoints rather than scaling it continuously with viewport width.

### Spacing and Surface

Use a 4px base rhythm with common steps at 8, 12, 16, 24, 32, 48, 64 and 96px. Use 4px radii for controls and repeated items, up to 8px for a single product-interface frame. Shadows should be soft and reserved for the illustrative banking interface; section structure should come from full-width bands and whitespace, not nested cards.

### Photography and Willow Motif

Use editorial everyday-life photography with natural light, human subjects and room for copy. Keep the campaign sequence close in warmth and contrast, with a consistent dark forest overlay for legibility. The current sequence moves from a customer reviewing a payment, to an everyday card payment, to a quiet planning moment. The willow reference stays abstract: connected paths, branching information and restrained organic shapes rather than leaf illustrations.

## Homepage Story

1. Utility bar: identify personal banking and provide a direct support path.
2. Navigation: Banking, Digital experience, Trust and security, Help, Sign in and Open an account.
3. Hero: explain what Willow is, who it serves and the next action, with the campaign image sequence.
4. Brand proposition: connect everyday clarity, room to grow and a people-first experience.
5. Products: checking, savings, debit cards and transfers link to their existing product pages.
6. Digital experience: show a clearly labeled illustrative account view and the practical account tasks it represents.
7. Financial wellbeing: describe how everyday activity can sit alongside longer-term plans without implying a return or outcome.
8. Support: offer existing Contact and About destinations.
9. Trust: state the demo status and leave regulatory, deposit-protection, privacy and certification details as explicit launch placeholders.
10. Closing action and footer: invite account exploration and retain the fictional-demo disclosure.

Do not use fabricated customer counts, ratings, uptime, rates, certifications, guarantees, awards or testimonials. Sample balances and transactions must remain visibly labeled as illustrative.

## Hero and Navigation

**Eyebrow:** Willow Banking Corp. / Personal banking.

**Headline:** Steady for what's next.

**Supporting copy:** Everyday accounts, cards, transfers and clear digital tools, brought together around the life you're building.

**Primary action:** Open an account.

**Secondary action:** Explore banking.

The hero uses a full-bleed image with a dark forest gradient and copy anchored to the lower left. It has three responsive campaign photographs. Each image holds for about 5.2 seconds, then crossfades over 1.2 seconds. A pause/resume control and direct scene selectors keep the sequence user-controlled. Rotation pauses while the document is hidden, while the user is interacting with the controls, or when the hero is out of view.

Navigation stays flat; the current product set does not need dropdowns. On compact screens, links move into a keyboard-operable menu with an exposed expanded state and Escape-to-close behavior.

## Components

**Buttons:** Forest primary action, high-contrast light hero action, and underlined text links for secondary navigation. Use clear labels and visible focus rings.

**Product links:** Four unframed, numbered items with a small icon field, concise description and direct route. Hover states are subtle and do not alter layout dimensions.

**Digital preview:** One framed, clearly illustrative sample experience; do not embed decorative cards inside more cards.

**Trust content:** A plain-language disclosure section with `[To be confirmed before production use]` placeholders for regulatory, deposit-protection, privacy and security-certification information until verified details exist.

**Forms:** Keep the existing accessible labels and validation patterns in the application. Apply the Willow type, text, border and focus tokens when those forms are rebranded.

**Footer:** Keep product, company and legal destinations visible, and retain the demo-platform notice.

## Animation

Hero copy enters in a short stagger: eyebrow, headline, supporting copy, then actions. The image sequence crossfades rather than slides; its slight scale change stays below 3%. Section copy reveals once as it enters the viewport. Link arrows and buttons move only a few pixels on hover. Avoid continuous number counters, parallax and large moving shapes.

For `prefers-reduced-motion: reduce`, stop automatic rotation, remove transitions and entrance/reveal movement, and leave the first image and all content visible. The user may still select a static scene manually.

## Responsive Behavior

**Desktop:** Full-height editorial hero, four-column product row, two-column digital preview, and wide trust band.

**Tablet:** Keep the hero text and controls separated; change product links to two columns and stack experience and trust layouts where needed.

**Mobile:** Preserve the image sequence and legible dark overlay, use a 42px hero heading, stack calls to action, expose navigation through the menu button, and collapse product links to one column. Keep the dashboard sample narrow and wrap its account rows without horizontal scrolling.

## Accessibility and Performance

Use semantic sections and heading order, descriptive stage labels, empty alt text for decorative overlapping slides, keyboard-operable scene controls, pressed/expanded states, Escape-to-close navigation and a visible focus outline. Ensure content remains available if JavaScript or IntersectionObserver is unavailable.

The first responsive image uses `srcset`, `sizes`, `fetchpriority="high"` and asynchronous decoding. Later images begin lazy and are promoted before their turn. In production, serve campaign images from a controlled asset host in AVIF/WebP with fallbacks, correct dimensions, and a preload for the first selected source. Keep overlays and fades on opacity/transform properties to avoid layout work.

## Production Readiness

Willow is currently a fictional demonstration platform. Before presenting it as a real financial institution, replace every regulatory, deposit-protection, privacy and security placeholder with independently verified, jurisdiction-appropriate information and have the product and claims reviewed.