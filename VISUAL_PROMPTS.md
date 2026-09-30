# Visual Prompts for Nano Banana

Nano Banana is not connected in this environment. These are ready-to-use prompts and an asset production plan; generated files are not included. The running site uses real Unsplash photographs as interim assets. Keep the current URLs until each replacement has been generated, reviewed for natural anatomy and cleared for use. Never substitute a missing local filename.

All photographs share an editorial campaign look: forest-green and warm neutral wardrobe, natural skin texture, realistic proportions, understated settings and gentle contrast. All text, balances, buttons, logos and gradients are rendered in HTML/CSS. Do not flatten an interface into a photograph.

## Asset manifest

| Filename under public/images/ | Dimensions | Placement / current interim asset |
|---|---|---|
| willow-hero-left.webp | 2400 × 1600 | Home hero Photo A, shopper on the left; photo-1483985988355-763728e1935b |
| willow-hero-right.webp | 2400 × 1600 | Home hero Photo B, shop scene on the right; photo-1556742049-0cfed4f6a45d |
| willow-auth-everyday.webp | 2400 × 1600 | Sign-in/registration campaign; photo-1556742049-0cfed4f6a45d |
| willow-planning.webp | 2400 × 1600 | Optional future supporting image; not currently used |
| willow-personal.webp | 1200 × 1500 | Personal feature card and personal overview; photo-1556742049-0cfed4f6a45d |
| willow-business.webp | 1200 × 1500 | Business feature card and overview; photo-1441986300917-64674bd600d8 |
| willow-goals.webp | 1200 × 1500 | Savings feature card; photo-1476514525535-07fb3b4ae5f1 |
| willow-family.webp | 1800 × 1200 | Optional future About/support image; not currently used |

Export sRGB WebP, retain a high-resolution original, and produce 720/1200/1800px hero variants for responsive srcset. Target less than 350 KB for each card and less than 500 KB for each largest hero image. Review at 390px, 768px and 1440px widths. Update alt text, src, srcset and focal crops together when replacing assets. The hero is a static horizontal blend of two separate assets using overlapping layers and wide gradient masks in public/css/hero-blend.css. Both must remain recognizable at once. Never flatten the pair, bake the blend into either image, or supply a fade to a solid page surface. Cards use a separate CSS dark gradient. The interim shop photo is mirrored to keep the cashier on the outer right; remove that transform and reverse its mask direction if a replacement is already composed with the subject on the right.

**1. Homepage Photo A — Everyday confidence, left side**

**Subject:** One adult shopper in their early thirties, with natural skin texture, a simple forest-green coat and a relaxed expression, holding two plain paper shopping bags. A candid everyday moment, with attention directed toward an off-camera shop rather than the viewer.

**Composition:** Separate landscape photograph, camera at eye height. Place the shopper around the left-middle of the source frame, with face and hands fully inside a generous crop-safe area. Keep the right 35 percent as softly lit, low-detail ivory wall for the center overlap with Photo B. The final hero places the subject in its outer left quarter. Keep lower-left clothing and background simple for live white headlines. Review the crop at phone width; no face or hand may enter the center mask.

**Key Elements:** Plain bags with realistic handles, natural clothing folds and correct five-finger anatomy. No visible phone screen, card numbers or brand marks.

**Environment:** A modest neighborhood shopping street or storefront with pale plaster and restrained timber details. Coordinate its wall tone and materials with Photo B so the transition feels continuous. No luxury showroom or currency props.

**Lighting:** Broad diffused daylight, soft neutral-warm white balance and gentle shadows. Match exposure, direction and contrast to Photo B. No harsh highlights behind the copy.

**Style & Details:** Believable premium editorial photography, approximately 50mm lens, mild depth of field, true skin tones and restrained forest accents. Maintain detail through every edge. Generate one photograph only; CSS supplies the blend with a different image.

**Aspect Ratio & Placement:** 3:2, 2400 × 1600px, willow-hero-left.webp. Left layer of the static two-photo homepage hero, with responsive focal cropping.

**Avoid:** Readable text, UI, numbers, bank or payment logos, card numbers, money, exaggerated smiles, waxy faces, extra fingers, duplicated limbs, cinematic neon, 3D rendering, branded devices, baked headlines and financial promises.

**2. Personal banking feature card — A small everyday moment**

**Subject:** An adult customer in casual charcoal and sage clothing checking an unbranded phone while waiting at a neighborhood café. Show a candid half-smile aimed at their task, not the viewer.

**Composition:** Vertical waist-up portrait, subject in the upper two-thirds and slightly right of center. Keep hands fully visible with natural grip. Leave the lower 35 percent as a simple table edge and softly blurred clothing, suitable for a separate CSS dark fade and HTML product labels. Provide generous side margins for card cropping.

**Key Elements:** Plain phone with screen angled away; unmarked cup; believable facial features and normal anatomy. A second person may appear only as an indistinct background silhouette.

**Environment:** Modest local café with soft timber, pale walls and everyday furnishings. No readable menus, posters or receipts.

**Lighting:** Soft daylight through a nearby window, gentle directional falloff and warm reflected light. Keep skin softly lit while retaining texture and realistic shadows.

**Style & Details:** Natural commercial lifestyle photograph, 50–85mm portrait perspective, restrained saturation, subtle grain and believable fabric. Match the hero's warmth. No embedded fade; the site renders it.

**Aspect Ratio & Placement:** 4:5, 1200 × 1500px, willow-personal.webp. Home personal card and personal overview.

**Avoid:** Posed thumbs-up, readable screens, payment brands, money, logos, card details, artificial teeth, plastic skin, malformed fingers, harsh flash, generated captions or interface elements.

**3. Business banking feature card — Pride in the working day**

**Subject:** A small independent shop owner in their forties, wearing a plain work apron over neutral clothing, naturally arranging an order at a counter. Their attention is on the task; expression is focused and approachable.

**Composition:** Vertical portrait with owner and hands in the upper-middle frame. Show enough environment to explain the business, without visual clutter. Reserve the bottom third as a quiet counter and apron surface for HTML text under a CSS forest fade. Keep important details away from the perimeter and allow a wide overview crop.

**Key Elements:** Neatly wrapped unbranded parcel, shelves of simple goods, plain notebook closed, realistic hands touching physical materials. No visible account documents or customer information.

**Environment:** A believable neighborhood retail or craft shop, modest timber shelving, warm ivory walls and softly weathered work surfaces. A business that feels operational, not staged as an aspirational luxury showroom.

**Lighting:** Indirect midday window light, gentle background falloff, realistic contact shadows under the parcel, no studio rim lighting.

**Style & Details:** Premium but grounded documentary commercial photography, natural facial texture and a coherent material palette. Convey effort and care without suggesting guaranteed business success. Full photographic edges for responsive cropping and CSS overlays.

**Aspect Ratio & Placement:** 4:5, 1200 × 1500px, willow-business.webp. Business feature card and business concept overview.

**Avoid:** Readable signs or labels, bank logos, cash stacks, invoices, payment terminals with branding, staged handshakes, glossy corporate suits, wealth symbols, distorted products or anatomy, text overlays and claims of returns.

**4. Savings and financial goals feature card — Room for tomorrow**

**Subject:** An adult in their late twenties sitting by an open window after packing a plain weekend bag, enjoying a quiet moment of anticipation. Natural, thoughtful expression; looking toward the daylight rather than at the camera.

**Composition:** Vertical environmental portrait with face and shoulders in the upper half. Include the unbranded bag near the center as a subtle suggestion of a plan. Leave the lower third as quiet upholstery or clothing for the CSS dark overlay and HTML labels. Avoid a busy horizon behind the text area.

**Key Elements:** Plain canvas bag, comfortable clothing, one simple mug or closed notebook. No money, graphs or symbolic rockets. The goal is human-scale and open to interpretation.

**Environment:** A modest comfortable home, warm timber, linen curtains and a glimpse of natural greenery. The setting should suggest an achievable personal plan without an implied financial outcome.

**Lighting:** Soft late-afternoon light with gentle warm highlights and believable shadow gradients. Keep facial detail and highlight recovery, without exaggerated golden glow.

**Style & Details:** Calm optimistic editorial photography, 50mm lens, natural posture, true-to-life texture and muted sage/ivory palette. No glamour retouching. Leave the photograph unmasked so CSS controls the fade.

**Aspect Ratio & Placement:** 4:5, 1200 × 1500px, willow-goals.webp. Home savings/goals card.

**Avoid:** Flying currency, fake coins, guaranteed wealth, luxury cars or houses, readable text, investment percentages, charts, staged celebratory gestures, extra limbs, AI gloss and baked interface elements.

**5. Optional supporting photograph — Time together**

**Subject:** Two adult family members of different generations and one school-age child preparing a simple meal together. Use different subjects from both hero photographs. Show a natural interaction such as passing vegetables, with realistic hands and relaxed expressions.

**Composition:** Wide environmental frame, group centered right with comfortable breathing room. Leave the left third calm for optional adjacent copy. Keep all faces in a crop-safe band with clear separation; no overlapping hands or clutter near the lower boundary.

**Key Elements:** Plain chopping board, vegetables, unbranded crockery and soft neutral clothing. No visible devices, financial documents or personal information.

**Environment:** A welcoming ordinary home kitchen with daylight, timber and cream surfaces. Lived-in details should be subtle and believable.

**Lighting:** Bright diffused afternoon window light, natural shadows and realistic highlights on utensils. No artificial glow or theatrical lighting.

**Style & Details:** Human, warm editorial photography with documentary spontaneity, subtle texture, restrained color and everyday scale. Convey companionship without an implied testimonial.

**Aspect Ratio & Placement:** 3:2, 1800 × 1200px, willow-family.webp. Optional About or support page; not currently loaded.

**Avoid:** Readable text, brand marks, artificial family poses, uniformly perfect smiles, malformed fingers, unsafe kitchen actions, money props, card data, fabricated endorsements and baked UI.

**6. Homepage Photo B — An ordinary payment, right side**

**Subject:** An adult customer and café worker sharing a natural moment at a small counter while the customer holds a plain unbranded card near an unbranded terminal. Both are concentrating on the interaction, not posing.

**Composition:** A separate landscape photograph, with the worker and payment interaction in the outer right third. Leave the left 35 percent as a softly lit low-detail ivory wall or counter for the wide center blend with Photo A. Keep every face and important hand detail outside this overlap area, with generous crop margins for phones. The images must remain separately recognizable. Do not show Photo A, a collage, a seam or a divider inside this asset.

**Key Elements:** One card without text or numbers, one plain terminal with no readable display, a simple ceramic cup. Anatomically accurate hands and a believable card-to-terminal distance.

**Environment:** A small contemporary neighborhood café with restrained sage and timber finishes. No menus, advertisements or logos visible.

**Lighting:** Natural overcast daylight and gentle ambient fill, matched to Photo A's warmth, light direction, exposure and contrast.

**Style & Details:** Realistic commercial editorial photograph, 35–50mm perspective, believable scale and candid facial expressions. No overlays or retouched artificial skin.

**Aspect Ratio & Placement:** 3:2, 2400 × 1600px, willow-hero-right.webp. Right layer of the static two-photo hero; supply responsive variants. The same campaign style may be exported separately as willow-auth-everyday.webp for authentication pages.

**Avoid:** Payment network brands, readable terminal interfaces, card numbers, bank names, money, duplicated hands, staged grins, visible receipts, baked typography and implied real transactions.

**7. Optional supporting photograph — A plan taking shape**

**Subject:** A different adult customer, calmly reviewing a closed notebook and packed travel bag near a bright living-room window. Their phone lies face down; thoughtful optimism rather than excitement about money.

**Composition:** Landscape with the subject on the right third, soft neutral negative space covering the left 45 percent. Include a simple foreground and keep face and bag in the right-center safe zone for narrow-screen crops.

**Key Elements:** Plain bag, closed notebook, unbranded face-down phone and natural clothing in sage or warm charcoal. Every prop must have realistic scale and contact shadows.

**Environment:** Attainable everyday living room with pale textured wall and linen, no conspicuous luxury or financial symbolism.

**Lighting:** Broad soft daylight, consistent with the other hero scenes, natural shadow falloff and gently warm color balance.

**Style & Details:** Believable editorial campaign photography, 50mm perspective, mild background blur, true skin texture and restrained contrast. Match campaign exposure and keep full photographic edges.

**Aspect Ratio & Placement:** 3:2, 2400 × 1600px, willow-planning.webp. Optional future supporting photograph; not part of the two-photo hero.

**Avoid:** Coins, currency, investment graphs, guaranteed returns, readable notebook pages, brand marks, exaggerated luxury, malformed anatomy, AI gloss, generated UI and logos.

The vector tree emblem is public/images/logo.svg, viewBox 0 0 80 80. It is built with SVG paths and is not an image-generation asset. Its curved canopy, hanging fronds, trunk and copper ground line remain sharp at small sizes.
