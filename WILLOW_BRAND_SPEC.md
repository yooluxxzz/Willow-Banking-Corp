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

Use a 4px base rhythm with common steps at 8, 12, 16, 24, 32, 48, 64 and 96px. Use 4px radii for controls and repeated items, up to 8px for a single product-interface frame. Use soft shadows selectively on account cards, feature panels and the illustrative banking interface. Full-width bands and whitespace define the sections.

### Photography and Willow Motif

Use editorial everyday-life photography with natural light, human subjects and room for copy. The hero combines two separate generated photographs at once: a banking customer on the left and a bank employee on the right, facing each other across a service counter. Their neutral interior, lighting, camera height and scale match. A dark forest overlay supports the desktop copy. The willow emblem has a curved canopy, hanging fronds and a clear trunk.

## Homepage Story

1. Utility bar: identify personal banking and provide a direct support path.
2. Navigation: Banking, Digital experience, Trust and security, Help, Sign in and Open an account.
3. Hero: explain what Willow is, who it serves and the next action, with two photographs crossfading in one fixed container.
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

The hero stacks two separate local WebP photographs in exactly the same full-size container. Photo A starts visible above Photo B. Their complementary opacity transitions last 800ms with cubic-bezier(0.35, 0, 0, 1). Both use identical object-fit: cover and object-position values, with no masks or position animation. An isolated plus-lighter blend prevents a dark midpoint flash; unsupported browsers retain an opaque lower image. Text, buttons and lower shading remain separate HTML/CSS above the images.

On phones, retain the same overlapping layers in a fixed 360px-high photo area. Use matching centered crops and place the copy beneath the photos on forest green so no face is covered by text.

Navigation stays flat; the current product set does not need dropdowns. On compact screens, links move into a keyboard-operable menu with an exposed expanded state and Escape-to-close behavior.

## Components

**Buttons:** Forest primary action, high-contrast light hero action, and underlined text links for secondary navigation. Use clear labels and visible focus rings.

**Product links:** Four unframed, numbered items with a small icon field, concise description and direct route. Hover states are subtle and do not alter layout dimensions.

**Digital preview:** One framed, clearly illustrative sample experience, with a soft layered shadow. Keep balances and labels as live HTML.

**Depth:** Selected photo/feature cards and the digital preview lift by 4px and tilt by 1 degree on desktop hover. Account and balance cards have static soft shadows. Hover motion requires a fine pointer, hover support and no reduced-motion preference. Touchscreens and reduced-motion settings disable these transforms and transitions. The hero stays a flat photographic composition.

**Trust content:** A plain-language disclosure section with `[To be confirmed before production use]` placeholders for regulatory, deposit-protection, privacy and security-certification information until verified details exist.

**Forms:** Keep the existing accessible labels and validation patterns in the application. Apply the Willow type, text, border and focus tokens when those forms are rebranded.

**Footer:** Keep product, company and legal destinations visible, and retain the demo-platform notice.

## Animation

The hero changes images every five seconds after both files decode. Only image opacity animates; copy and geometry remain fixed. Manual scene selection pauses autoplay, and a pause/play control is available. Autoplay suspends when the page is hidden or the hero is offscreen. Section copy reveals once as it enters the viewport. Avoid continuous number counters, parallax and large moving shapes.

For `prefers-reduced-motion: reduce`, disable hero autoplay and opacity transitions, and remove entrance/reveal movement. Manual image selectors remain available with immediate changes; hide the unnecessary play control.

## Responsive Behavior

**Desktop:** Full-height editorial hero, four-column product row, two-column digital preview, and wide trust band.

**Tablet:** Keep both image layers identically aligned; change product links to two columns and stack experience and trust layouts where needed.

**Mobile:** Crossfade in a compact fixed photo area with identical centered crops, followed by readable copy and calls to action. Use a 44px hero heading, expose navigation through the menu button, and collapse product links to one column. Keep the dashboard sample narrow and wrap its account rows without horizontal scrolling.

## Accessibility and Performance

Use semantic sections and heading order, descriptive alt text for both hero photos, expanded states, Escape-to-close navigation and a visible focus outline. Ensure content remains available if JavaScript or IntersectionObserver is unavailable.

Both responsive hero images use `srcset`, `sizes` and asynchronous decoding; the first has `fetchpriority="high"`. In production, serve campaign images from a controlled asset host in AVIF/WebP with correct dimensions. Keep the images separate and animate only opacity. The first image remains visible without JavaScript, and selectors expose their current state through aria-pressed.

## Production Readiness

Willow is currently a fictional demonstration platform. Before presenting it as a real financial institution, replace every regulatory, deposit-protection, privacy and security placeholder with independently verified, jurisdiction-appropriate information and have the product and claims reviewed.
## Authentication and emblem update

Sign-in and two-step registration use a forest campaign panel and warm ivory form surface, Newsreader headings and DM Sans labels. At phone widths the form takes the full width. All form controls have labels, visible focus, password visibility controls and explicit errors. The SVG emblem shows a curved willow canopy, hanging fronds and a trunk in an evergreen circle with a subtle copper ground line. No rasterized text or generated logo is used.
