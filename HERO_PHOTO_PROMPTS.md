# Two companion banking photographs

These are two separate prompts for Nano Banana or another photorealistic image generator. The implemented assets were created with the built-in image generation tool, not Nano Banana. Photo B used Photo A as a lighting, environment and scale reference. No reference screenshot accompanied the latest text brief; the implementation follows its written requirements.

## Photo 1 — Banking customer, left

**Subject:** A banking customer completing an everyday transaction and speaking naturally to a helpful employee just outside the right edge.

**Composition:** Wide horizontal, waist-up editorial photograph. Put the customer on the left, looking slightly right. Keep the right 40 percent simple and free of people so it can overlap the companion image. Keep face and hands clear of the center blend.

**Key Elements:** Natural expression, believable everyday clothing, realistic hands and a subtle service counter. No readable text, logos, account screens or payment cards.

**Environment:** A bright contemporary bank interior with pale warm-neutral plaster, understated oak surfaces and soft background detail.

**Lighting:** Even diffused daylight, gentle shadows and warm-neutral white balance. Match the companion employee photograph.

**Style & Details:** Photorealistic editorial banking campaign photography, eye-level 50mm perspective, candid and calm, natural skin texture and restrained color.

**Aspect Ratio & Placement:** 3:2 landscape, 1536 × 1024. Left layer of an edge-to-edge hero, with quiet lower detail for a live CSS overlay.

**Avoid:** Text, logos, watermarks, interfaces, cards, distorted anatomy, exaggerated smiles, harsh studio light, frames, baked fades, collages or 3D people.

Exact prompt used:

```text
Use case: photorealistic-natural. Asset: LEFT photograph in a two-photo banking website hero, generate ONE separate photo only, landscape 3:2. A real adult banking customer, waist up, in believable casual everyday sage clothing, standing at a service counter and looking slightly RIGHT toward a helpful bank employee who is outside the frame. Position customer's face at approximately 30% of image width, with head fully inside frame, eye line at 28% of image height, waist near lower edge. Natural attentive expression, candid not posed. Contemporary welcoming bank interior, pale warm-neutral plaster wall, subtle oak counter at lower edge, softly blurred neutral detail. The RIGHT 40% must contain only simple pale neutral wall and low-detail counter, no people, plants, lines, bright windows, screens or conspicuous objects, to allow a soft CSS overlap with a companion photograph. Camera at eye level, 50mm commercial editorial photography, realistic natural skin and hands, soft evenly diffused daylight, warm neutral white balance, gentle shadows and restrained color grade. Lower quarter quiet and slightly darker, full photograph to all edges. No text, logos, watermarks, readable screens, payment cards, UI, frame, gradient fade, collage or composite. Do not generate the companion employee in this photo. Keep face and hands away from right seam area. Photo must remain an ordinary flat photograph, not 3D rendering.
```

## Photo 2 — Bank employee, right

**Subject:** A friendly bank employee helping the customer outside the left edge with an everyday banking question.

**Composition:** Wide horizontal, waist-up photograph. Put the employee on the right, looking slightly left. Keep the left 40 percent as a simple neutral wall and counter. Match the customer's camera height, person scale and counter line.

**Key Elements:** Attentive expression, neat relaxed clothing, realistic hands and subtle counter details. No readable text, logos, account screens or payment cards.

**Environment:** The same contemporary banking interior, pale neutral walls, oak surfaces and soft background detail as Photo 1.

**Lighting:** The same diffused daylight, gentle shadows, exposure and warm-neutral color grade as Photo 1.

**Style & Details:** Photorealistic editorial campaign photography, natural skin texture, candid gestures and understated color. Use Photo 1 only as an environment, lighting and scale reference.

**Aspect Ratio & Placement:** 3:2 landscape, 1536 × 1024. Right layer of the hero. Preserve simple left-edge detail and quiet lower space for the CSS blend and overlay.

**Avoid:** Text, logos, watermarks, interfaces, identifiable cards, distorted hands, duplicate people, exaggerated smiles, frames, baked gradients, collages or 3D rendering.

Exact prompt used with Photo 1 as the reference image:

```text
Use case: photorealistic-natural. Create the separate RIGHT companion photograph for this banking campaign. The supplied image is a STYLE, LIGHTING, SCALE and ENVIRONMENT REFERENCE only. Generate a DIFFERENT photograph of a friendly adult male bank employee helping the customer who is outside the LEFT edge. Do not include the woman or duplicate her body. Same contemporary bank interior, same pale warm-neutral plaster wall, same subtle oak service counter along lower edge, same soft diffused daylight, neutral-warm exposure, eye-level 50mm camera and natural skin texture. Waist-up employee wearing a neat relaxed charcoal jacket over an unbranded open-collar ivory shirt. Position his face around 73% of image width with eyes at 28% image height, naturally looking LEFT toward the customer, attentive slight smile. Body and natural hands on the counter remain in the outer right area, away from the LEFT 40% which should be only simple softly lit pale neutral wall and low-detail counter. Match the reference counter height and horizontal background trim so these two images can overlap across the empty central area into a continuous wide scene. Keep the person at the same scale as the woman in the reference. Full landscape 3:2 photograph to every edge, one photo only. No text, logos, watermarks, screens, payment cards, frames, baked gradients, collage, webpage, UI, 3D render, harsh lighting or exaggerated smiles. Keep fingers anatomically correct and avoid overlapping hands.
```

## Saved assets and integration

| File in public/images | Dimensions | Bytes |
|---|---|---|
| willow-hero-customer.webp | 1536 × 1024 | 72,344 |
| willow-hero-customer-768.webp | 768 × 512 | 19,510 |
| willow-hero-employee.webp | 1536 × 1024 | 62,318 |
| willow-hero-employee-768.webp | 768 × 512 | 18,664 |

Each asset is separate and locally served. The two largest WebP files total about 132 KiB; their smaller variants total about 37 KiB. The generated originals were only resized and encoded for delivery, without flattening or compositing them.

The prompts above record the original companion-photo generation. The latest animation brief supersedes the side-by-side layout: public/css/hero-crossfade.css stacks both full-frame assets with identical cover crops and animates complementary opacity over 800ms using cubic-bezier(0.35, 0, 0, 1). Text, buttons and lower shading are separate HTML/CSS. The hero stays pinned while scrolling changes Photo A and its headline into Photo B with new details. It then releases into the page categories. Phones put photos above the copy in the same stage. Scrolling up restores Photo A. There is no autoplay or playback UI. Reduced motion removes the transition.

public/css/depth.css gives selected cards soft shadows and a restrained perspective hover. Hover movement requires a fine pointer, hover support and no reduced-motion preference; touch and reduced-motion layouts remain stable. The photographic hero stays flat and only changes opacity.

## Five-scene homepage story

The current homepage hero uses five sequential scenes: the local Willow customer photograph for everyday banking, then CDN photographs for a family/home goal, business, travel and wealth. The four Unsplash URLs use responsive 768px and 1536px candidates, automatic format selection and quality 76. These URLs were checked for availability when integrated; they remain an external runtime dependency and should be replaced by controlled optimized assets before production.

Scene-matched headlines and calls to action remain live HTML. The pinned scroll journey selects all five scenes; before interaction, autoplay crossfades every ten seconds. Pointer, focus, keyboard, wheel and touch interaction pause it. A visible control resumes or pauses the sequence. Reduced-motion preference disables autoplay and scroll-driven scene changes and keeps the first local photograph static.
