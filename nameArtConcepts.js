// The ten premium name-art directions driving the in-app renderer (api/generate-name-art.js).
// Deliberately NOT part of buildExternalImagePrompt below: a chat model handed both this list
// and the master brief would treat the list as the answer, which is exactly the fixed
// royal → nature → cosmic sequence that brief forbids. Kept as plain .js because the client
// imports the builders from this same file.
export const NAME_ART_CONCEPTS = [
  { id: "royal", label: "Royal Luxury", uz: "Royal", art: "deep charcoal-black background, elegant polished gold typography, restrained regal geometry, high-end luxury lighting, sophisticated and understated" },
  { id: "nature", label: "Nature Integrated", uz: "Tabiat", art: "letters physically built from moss, stone and wood in a photorealistic forest clearing, golden-hour light, deep natural realism" },
  { id: "cosmic", label: "Cosmic", uz: "Kosmos", art: "deep space with stars and a soft nebula, letters in luminous chrome and glass, epic but refined, cool celestial glow" },
  { id: "urban", label: "Urban Premium", uz: "Shahar", art: "cinematic modern city at night, wet reflective streets and glass architecture, letters integrated into the environment, ambitious polished mood" },
  { id: "minimal", label: "Minimal Luxury", uz: "Minimal", art: "very clean composition, neutral dark premium backdrop, huge embossed matte stone letters, strong controlled shadows, minimal and expensive" },
  { id: "floral", label: "Floral Elegant", uz: "Gul", art: "letters interwoven with realistic fresh flowers, leaves, pearl and silk, graceful composition, soft premium lighting" },
  { id: "fire", label: "Fire & Power", uz: "Olov", art: "letters forged from molten metal with glowing hot edges and drifting sparks, dark dramatic contrast, controlled cinematic fire" },
  { id: "art", label: "Artistic Colour", uz: "Rang", art: "bold expressive lettering shaped by colour powder explosion and paint splash, energetic street-art texture, professionally composed, letters stay crisp" },
  { id: "crystal", label: "Glass & Crystal", uz: "Kristall", art: "letters cut from clear crystal and faceted gemstones, studio product-photography lighting, elegant reflections and caustics" },
  { id: "symbolic", label: "Symbolic Scene", uz: "Ramziy", art: "one symbolic object matching the meaning of the name (a key, moon, mountain path, fountain pen, butterfly or bridge), letters integrated naturally and elegantly into the scene" },
];

const cleanName = (name) => String(name).trim().toUpperCase().slice(0, 20);

const toneFor = (gender) =>
  gender === "FEMALE" ? "graceful feminine" : gender === "MALE" ? "strong masculine" : "balanced";

// Spelling the name out letter by letter is what makes the model get it right — asked plainly
// for "MALIKA" it renders "MAUKA". Kept deliberately short on negatives: a long "no text, no
// letters, no words…" list makes the model return a response with no image at all.
export const buildNameArtPrompt = (name, gender, concept) => {
  const clean = cleanName(name);
  const letters = clean.split("").join("-");
  // "Written across a single horizontal line" matters: in a 9:16 frame the model otherwise
  // stacks the letters one per row, which reads as a column rather than a wordmark.
  return `Premium vertical name-art poster. The word ${letters} (spelled "${clean}", ${clean.length} letters, Latin alphabet) is the hero of the image, written across ONE single horizontal line in the middle of the frame, large and clearly readable, every letter distinct and unobstructed. Style: ${concept.art}. Overall tone ${toneFor(gender)}, art-directed, cinematic colour grading, realistic materials. One single standalone artwork filling the frame, not a collage or grid. The only text is ${clean}.`;
};

// The full brief a user pastes into an external text-to-image tool. The "not image editing"
// preamble earns its length because chat-based image tools default to editing whatever picture
// is already in the thread; without it the 2nd..10th concept come back as retouches of the first.
// The rest is an anti-template brief: it deliberately refuses to name the ten directions so the
// model has to invent its own, which is what stops the set reading as one design in ten skins.
export const buildExternalImagePrompt = (name, gender) => {
  const clean = cleanName(name) || "ISM";
  const letters = clean.split("").join("-");
  const g = gender === "FEMALE" ? "FEMALE" : gender === "MALE" ? "MALE" : "UNISEX";

  return `SUPER PREMIUM NAME ART — FINAL MASTER PROMPT

INPUT
Name: ${clean}
Gender: ${g}
Exact spelling: ${letters} (${clean.length} letters, Latin alphabet)

MODE — CRITICAL
This is a FRESH TEXT-TO-IMAGE task.
Do NOT treat this as image editing.
Do NOT request a source image.
Do NOT request a target image.
Do NOT edit or reuse previous generations.
Every concept must start from a blank canvas.

GOAL
Create 10 completely different SUPER PREMIUM personalized NAME ART images for the exact requested name.
The result should feel like:
- elite international creative studio work
- cinematic advertising key visual
- premium typography campaign
- high-end personalized digital artwork
- Behance-quality design
- premium phone wallpaper

This is NOT a template system.
Every new name must create a new visual universe.

1. FIRST: CREATE A UNIQUE CREATIVE DNA
Before generating images, internally interpret:
- likely meaning of the name
- emotional personality
- rhythm and sound
- likely origin
- visual associations
- first and last letters
- interesting letter shapes
- curves, diagonals and repeated letters
- monogram or ligature possibilities
- softness vs strength
- modern vs classical feeling

Do NOT display this analysis.
Use it only to invent designs specifically for:
"${clean}"

2. 10 IMAGES = 10 ORIGINAL BIG IDEAS
Create exactly 10 separate images.
ONE GENERATION = ONE IMAGE.
Generate sequentially:
Concept 01/10
Concept 02/10
Concept 03/10
Concept 04/10
Concept 05/10
Concept 06/10
Concept 07/10
Concept 08/10
Concept 09/10
Concept 10/10

Do NOT combine them.
Never create:
- grid
- collage
- contact sheet
- comparison board
- multiple panels
- 10 thumbnails inside one image

Each result must be one complete standalone artwork.

3. THE NAME IS THE HERO
Render the exact name:
"${clean}"
The name must be the main visual subject.
It should NOT look like text added on top of a background.
Transform the name into part of the artwork:
- physical sculpture
- architecture
- premium object
- environmental installation
- custom typography
- material structure
- symbolic form
- artistic object

The viewer should notice the name immediately.
The name should normally occupy approximately 35–70% of the important composition.
Do NOT make it tiny.

4. EXACT TEXT ONLY
The ONLY intentional text allowed is:
"${clean}"
Do NOT:
- misspell it
- remove letters
- add letters
- duplicate letters
- add slogans
- add quotes
- add captions
- add random English words
- add fake logos
- add numbers
- add watermarks

Correct spelling has higher priority than decorative complexity.

5. ABSOLUTE ANTI-TEMPLATE RULE
Do NOT create:
- same name
- same composition
- only a different background/material/color

That is a FAILURE.
For example:
gold serif → glass serif → flower serif → ice serif → stone serif
is NOT 5 concepts.
It is one template with 5 skins.
Every concept must begin from a different creative idea.

6. EACH CONCEPT MUST CHANGE IN AT LEAST 7 WAYS
Every new image must differ substantially from previous ones in at least 7 of these:
1. typography family
2. letter silhouette
3. composition
4. material
5. environment
6. color palette
7. lighting
8. camera angle
9. physical scale
10. symbolism
11. visual mood
12. level of minimalism

If fewer than 7 are clearly different:
REJECT THE CONCEPT AND INVENT A NEW ONE BEFORE GENERATION.

7. TYPOGRAPHY — EXTREME VARIETY
10 images must have 10 clearly different typography identities.
Changing material is NOT enough.
The actual letter shapes must change.
Across the set, explore genuinely different directions such as:
- serif
- sans-serif
- condensed
- wide
- geometric
- architectural
- calligraphic
- signature
- brush
- experimental display
- sculptural
- monoline
- monumental
- organic/custom lettering

Do NOT follow this list in a fixed order.
Hard limits:
- maximum 2 serif-based concepts
- maximum 2 script/calligraphy concepts
- never reuse the same typography family twice

Before generating ask:
If all colors, effects and materials disappeared and only black letters remained, would this typography still look clearly different from previous concepts?
If NO — redesign it.

8. COMPOSITION MUST ALSO CHANGE
Maximum 2 of the 10 concepts may use a simple centered horizontal name.
The other concepts must explore stronger layouts such as:
- asymmetric composition
- monumental low angle
- oversized cropped typography
- architectural perspective
- vertical typography
- diagonal typography
- extreme close-up
- macro
- top-down
- deep environmental perspective
- floating physical installation
- negative-space minimalism
- object-sized lettering
- landscape-scale typography

Do not use these mechanically.
Invent what fits the current name.

9. PHYSICAL INTEGRATION
Avoid:
font pasted on background.
Whenever possible, make the name physically exist in the scene.
The letters may:
- cast real shadows
- reflect the environment
- refract light
- emerge from surfaces
- exist as architecture
- interact with water
- interact with fabric
- grow through natural materials
- float with believable depth
- bend or transform physically
- exist at unusual scale
- interact with light or atmosphere

Typography and environment must feel like one physical world.

10. MATERIALS MUST FEEL REAL
Materials must influence the design, not simply decorate the letters.
If using:
Glass → thickness, refraction, realistic highlights
Metal → reflection, roughness, real edges
Stone → pores, weight, cracks, mass
Fabric → folds, weave, tension
Water → reflection, refraction, surface behavior
Ice → translucency, frost, depth
Paper → fibers, edges, folds
Fire/light → nearby objects must react to illumination
Avoid cheap plastic-looking CGI.

11. RANDOM CREATIVE DIRECTION
The 10 concepts must be unpredictable.
Do NOT use a fixed sequence like:
royal → nature → galaxy → city → floral → fire.
Every run must invent a new combination.
At least 5 of the 10 concepts must be creative ideas not explicitly suggested anywhere in this prompt.
Invent them.
Random does NOT mean chaotic.
Every concept must remain:
- coherent
- premium
- intentional
- visually strong
- relevant to the name

12. NAME-SPECIFIC RULE
Before accepting any concept ask:
Could I replace "${clean}" with another random name and keep this exact design unchanged?
If YES:
REJECT IT.
The design must use something specific about:
- meaning
- personality
- rhythm
- first letter
- word shape
- letter geometry

of the requested name.

13. AVOID REPETITIVE SHORTCUTS
Do NOT automatically use:
- crown
- rose
- butterfly
- car
- galaxy
- fire
- moon
- black + gold
- pink + flowers

These are allowed only when they genuinely fit one specific concept.
Maximum:
- black + gold: 1 concept
- crown/regal imagery: 1 concept
- floral/pink dominant: 1 concept
- neon dominant: 1 concept
- crystal/ice dominant: 1 concept

Do not repeat the same dominant material or palette.

14. NO HUMAN BY DEFAULT
Do not automatically add people.
This is NAME ART, not portrait generation.
A person may appear only if one concept genuinely becomes stronger with human presence.
If used:
- the name remains the hero
- person stays secondary
- photorealistic anatomy
- natural pose
- premium editorial quality

15. SAFE CREATIVE DIRECTION
All concepts must remain:
- family-safe
- brand-safe
- elegant
- positive
- suitable for a public name-meaning website

Do not use:
- violence
- weapons
- blood
- injury
- horror
- nudity
- sexualized imagery
- drugs
- illegal activity
- hateful/extremist imagery
- self-harm
- dangerous acts
- political propaganda

If a random idea risks becoming unsafe:
replace that concept before generation.
Creative surprise should come from design, typography, scale, materials, architecture, light and composition.

16. PREMIUM QUALITY FILTER
Before generating each concept internally score:
- Originality
- Typography
- Composition
- Name specificity
- Material realism
- Lighting
- Visual impact
- Premium feel
- Difference from previous concepts

If an important category feels below 8/10:
DO NOT GENERATE IT YET.
Improve or replace the concept.
Target overall quality: 9/10+.

17. VISUAL STANDARD
The result should feel closer to:
- international advertising campaign
- elite typography studio
- cinematic art direction
- high-end digital artwork

and NOT:
- Canva template
- greeting card
- generic Pinterest name wallpaper
- random AI text effect
- cheap 3D lettering
- over-glow
- excessive particles
- clutter

Every image needs one strong visual idea.

18. FORMAT
Every image:
- native 9:16 portrait
- full-bleed
- edge-to-edge
- smartphone-first
- standalone

Do NOT create:
- black bars
- frames
- poster-inside-poster
- phone mockups
- screenshot layouts
- horizontal image inside vertical canvas

The artwork itself fills the whole canvas.

19. GENERATION COMMAND
Create exactly 10 SEPARATE SUPER PREMIUM NAME ART images for:
Name: ${clean}
Gender: ${g}
For each image internally use:
Create exactly ONE standalone premium 9:16 personalized NAME ART image.
This is Concept XX/10.
Start this concept from zero.
Generate ONLY this concept.
Use a typography identity, composition, material, environment, palette, lighting, camera perspective, scale and central idea that are clearly different from all previous concepts.
The exact name "${clean}" must be the visual hero.
Do not create a grid, collage, contact sheet or multi-panel image.
Do not add any text except the exact name.
Do not use or edit any previous image.
This is fresh text-to-image generation.
Continue separately until Concept 10/10 is complete.

FINAL PRIORITY
If any rules conflict, prioritize in this exact order:
1. Exact spelling of the name
2. 10 separate images
3. 10 genuinely different BIG IDEAS
4. 10 different typography identities
5. Strong name-specific design
6. Premium visual quality
7. 9:16 full-screen composition
8. Safe / family-friendly content

DO NOT CREATE 10 VARIATIONS.
CREATE 10 DIFFERENT DESIGNS.
EVERY NEW NAME = NEW CREATIVE DNA.
EVERY RUN = NEW RANDOM ART DIRECTIONS.
EXACT NAME.
SUPER PREMIUM.
NO TEMPLATE.
NO EXTRA TEXT.
NO WATERMARK.
NO COLLAGE.`;
};
