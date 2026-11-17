# 12 / Feather

Procedural blobby creatures arrive wearing complete bright crests, stand up,
then step and preen before a three-panel folding mirror. A silent Strudel pattern
introduces a new creature every six bars (12 seconds at 120 BPM) by default.
Six plumage families combine seeded silhouettes with chromatic, golden and
eye-marked feather colors. The creatures have no eyes or facial features.
The stage contains only 3D geometry;
there are no added HTML or canvas annotations.

Run `npm run dev` in the visible VS Code terminal. The inherited Vite configuration
prefers **http://127.0.0.1:1234/**; the user's current server uses port 1235. Reuse the existing shared
VS Code browser tab. `Space` or a click/tap on the scene generates a new bird and
restarts the full generation timer. `P` pauses, `H` reveals the inherited controls
drawer, and `M` toggles Strudel audio. Left-drag orbits, right-drag pans, and scroll zooms.
Dragging, pinching, typing and activating controls do not generate birds.
The drawer is hidden by default. No new subject sliders have been added.

## Inherited studio inventory

The application was first copied from **11-rust**, then its subject was replaced.
The fuller controls in **02-shatter-drafting** (material and lighting editors)
and **04-tangle-drafting** (controls, bloom, PNG export) were also inspected.

| Feature | Source retained here |
| --- | --- |
| Drawer, tabs, keyboard commands, pause, FPS | 11-rust `controls.js`, CSS |
| Save / Reload / Reset | 11-rust `settings.js`, `persistence.js`, `server/setup-api.js` |
| Palette workshop and library | 11-rust `palette-workshop.js`, `palette-library.js`, studio palettes |
| Orbit, pan, zoom, saved camera, follow | 11-rust `camera.js`, `main.js` |
| Key, fill, hemisphere, spotlight, shadows | 11-rust lighting editors and schema, `shadows.js` |
| Environment reflections and material editors | 11-rust material and lighting controls, RoomEnvironment |
| AO, bloom, tilt blur | 11-rust `scene-effects.js`, `tilt-focus.js` |
| PNG export | 11-rust `main.js` drawer action |
| Strudel activation, synthesis, modulation, pause, cleanup | 11-rust `score.js`, synth and audio modules |
| Box3D initialization, fixed stepping, disposal | 11-rust `physics.js` |
| Gallery player bridge and build metadata | 11-rust `player-bridge.js`, scripts |

## Subject implementation

The creature uses **Caustic's October 29 mesh pipeline**, regenerated live with
Manifold CSG. Its five seeded overlapping boxes pass through the same saved
triangulate, diamond-dual, hexelate, and smoothing recipe used to make Caustic's
three reference meshes. `src/caustic-mesh/` contains the actual copied source
modules; `pipeline.json` preserves Caustic's recipe. `creature-mesh.js` centers
and uniformly scales the finished result without replacing its polygons.
The first three generation seeds are 732234, 836963, and 941692, matching Caustic.

The original `createBoxRig` fits up to thirteen hull vertices to each source-box
region, builds its five dynamic Box3D bodies and four spherical joints, and
uses the original distance-to-box skin weights and GPU skeleton. The original
polygon-normal shader keeps each n-gon coherent across its internal triangles.
The simplified ellipsoid generator and kinematic sphere host have been removed.
Rare box arrangements that produce a folded dual polygon are rejected with a
bounded, deterministic retry (up to eight seeds). The pipeline stays unchanged;
successful seeds retain their exact reference meshes. Diagnostics expose the
requested seed, accepted seed and attempt count so an arrival remains reproducible.

Each creature owns a generated `MeshPhysicalMaterial` from `glamour-material.js`.
Seven finish families—nacre, ribbon lacquer, petrol pearl, opal marble, gilt
pinstripe, confetti enamel and holographic satin—cycle independently of the ten
crest families. Seeded hues, stripe widths, flow fields, projection angles and
thin-film thickness give each creature an individual finish.

Every finish owns two generated textures: color paint and packed film thickness,
roughness, metallic flecks and iridescence strength. Triplanar mapping uses the
original mesh positions and normals before skinning, so the pattern remains
attached through deformation without UV seams or sliding. Physical clearcoat,
sheen and thin-film iridescence react to the spotlight, environment and viewing
angle in the mirrors. The original polygon-normal shader remains composed with
the finish shader. Existing skin tint, roughness, metalness and opacity controls
still work; roughness also adjusts the top coat.

The simulation owns and disposes its skin material and both paint textures when
that creature leaves. The next creature receives distinct material and texture
objects. Shared lighting and environment resources are retained, and all finishes
reuse the same shader program structure. Repeating a seed reproduces its paint.

Every creature starts **full-sized five units above the floor** and falls under
gravity, landing in about .55 seconds at the default settings. Its five hulls
contact the floor and deform the skin on impact. The body never scales into or
out of view. At the next cycle a newly generated body drops in; the previous
body is removed without a shrink animation.

`creature-motion.js` finds two or three low hulls to use as feet. After impact,
bounded Box3D motor springs restore the original upright pose. Each lower hull
lifts and plants in .16–.19 seconds, with a short gap between steps. The planted
targets stay fixed while other feet move. A sequence of small position changes
and turns brings the body around to inspect its reflection. Holds last roughly
.8–1.45 seconds and include fast, separate head turns on the upper hulls. The
five skinning bodies remain dynamic, connected by their original spherical
joints; only the invisible spring targets are kinematic.

`surface-attachments.js` distributes follicles across the upper surface before
the drop. Each attachment stores triangle indices and barycentric weights, so
roots follow the rendered skin. The complete feathers are visible on the first
frame; the same attachments and rigid bodies persist through landing and posing.

`plumage-layout.js` provides ten coherent surface flow fields (+Z front, −Z rear):
a convergent swept crest, a graduated rear fan, a side sweep, a parted double
crest, an upright arched fan, a cascading crest, a compact velvet cap, a broad
royal fan, a ribbon train, and a tall pointed flame crest. Seeded spread,
handedness, arch height, size and fullness vary within each family. The fan
directions span the actual crown's follicles, including asymmetric CSG bodies.

Six solid vane outlines—lance, rounded, paddle, sabre, ribbon and scalloped—vary
the width profile, asymmetry, camber, twist and actual edge silhouette. Each
creature layers short rounded coverts, medium feathers and large display vanes,
ordered by height and front-to-back position. Compact caps and large trains
differ substantially in size. Later cycles also change the dominant vane type
within an arrangement. The existing length, width and count values remain the
base controls, with the same number of feather bodies and three colliders each.

Six paint styles add gradients, chevron bars, jewel spots, colored edging,
speckles and ombré bands. Markings use the feather's own UVs, with a coherent
seeded palette, darker tips, fine barbs and a central rachis. They share one
material and shader, with no per-feather textures. All variants retain opaque,
continuous vanes and the corrected double-sided AO depth pass.

Kinematic follicle frames drive the dynamic feathers with restricted angular
movement. Three thin convex sections follow each curved vane, allowing shingled
layering; separate collision categories keep them clear of the body's overlapping
internal hulls. The body remains fully dynamic. Contact envelopes cover the
central vane, so fine edge overlaps remain an approximation. The whole crest
arrives fully formed, with no scale or growth animation. Lightly damped restoring
torque gives the vanes bounce at impact and follow-through during steps and head turns.
The longest train stays clear of the mirror at its rest pose. Follicle frames
retain their orientation through zero-area skin triangles, and a bounded angular
target speed prevents a sharply folding triangle from snapping its feather.
Root positions still follow the exact barycentric skin position.

`generation-score.js` uses the actual Strudel core pattern engine. The saved
`cadence` contains `bars` (phrase length, four beats per bar) and `rhythm` (`x`
for arrivals and `.` for rests, evenly spaced across the phrase). For example,
`{ "bars": 8, "rhythm": "x.x." }` introduces a creature every four bars. The
existing saved audio tempo supplies BPM. No new controls or musical patch were
added. The visual pattern works while muted and before audio is unlocked.

The phase persists across automatic generations, follows tempo changes without
restarting, and freezes with the sketch or hidden tab. Initial onset zero belongs
to the first creature, preventing a duplicate arrival. Manual regeneration,
Reload and Reset restart the phrase. This clock is silent: it never triggers
periodic synth notes.

`creature-foley.js` turns the actual simulation into natural-history-style foley.
Body/floor contact starts one cushioned landing, followed by diminishing feather
settling. A lifted lower hull must physically contact the floor to produce a
footstep; planted sliding adds short scrapes. Head and body turns produce brief
feather brushes with a trailing flutter. Vane contacts are coalesced and gated
by movement, so resting collision chatter does not become a continuous hiss.
Glass/wood textures require actual furniture contact. Still inspection holds
remain quiet. Pausing or muting stops the sound; regeneration stops the previous
creature's samples before the next arrival.

`feather-sounds.js` bakes ten original broadband textures with six seeded variants
each, then registers them as native Strudel sample voices using the inherited
Rust sound-effect loader. No pitched carrier, bird call, background loop, sample
download or audible generation clock is used. Body size and plume dimensions
affect texture register and brightness; small per-gesture differences avoid
identical repeated steps. At most six voices overlap, with a reserved impact
slot and a limit on rustle starts. The sample bank is about 2.1 MB at 44.1 kHz and
is shared across creature generations.

The existing sound panel owns master volume, mute, tempo and both saved voices:
body/feet and plumage. Texture and register color the samples; rhythm gates
successive gestures rather than clock beats. Filters, envelopes, stereo placement,
reverb, delay and body-height mappings apply to new gestures; master volume and
voice levels also update sounding samples. The former FM fields control fibre
contrast and scale. No new controls or overlay were added.

`dressing-room.js` raises the mirror glass three units above the floor. Six
turned walnut legs, brass collars, curved front/back shoes and lower stretchers
support the moulded gilt frames. Shared panel transforms keep Box3D's raised
panels and foot colliders aligned with the visible furniture, including when
the mirror fold changes. The space underneath the glass is open.

The red satin drapery consists of a pleated backdrop, two gathered side curtains
with tieback cords, three scalloped swags and a sewn heading. These are curved meshes with
actual folds, normals and tangent frames. A physical cloth material supplies
anisotropic highlights and satin sheen; the folds cast and receive shadows.

One real shadow-casting spotlight lights the stage: the original 27° cone from
`(-10,29.5,16)` toward `(0,2,0)`, with intensity 9000. The floor now uses stock
`MeshStandardMaterial`; curtains use `MeshPhysicalMaterial`. Three's standard
lighting shaders apply the actual light's distance falloff, cone penumbra,
surface normals and shadow map to both. There is no painted floor gradient,
second projection, or compensating cone scale. The existing Soft edge and
Shadow softness controls separately adjust cone falloff and filtered cast shadows.

The default unshadowed fill and hemisphere lights are disabled. Floor and cloth
have an explicit environment map with zero intensity: leaving the map unset
would make Three use `scene.environmentIntensity`, illuminating them even with
the spotlight off. The generated glamorous finishes retain their environment
reflections. The floor is black outside the real cone; cloth outside that same
cone, including the upper swags, is also dark. The narrow beam is not enlarged
to illuminate the entire drapery. The background is black.
Opaque feather vanes participate in the AO depth and normal pass on both sides,
preventing the mirror frame's occlusion shading from appearing through them.
No extra lamp controls or overlays were introduced.

The three planar mirrors, feather contacts, Strudel audio transport, studio,
palette workshop, material editors, effects, camera and owned settings API are
retained. No new overlay, panel, or subject controls were added. New persisted
`mesh` and `pipeline` settings use the existing setup schema and player bridge.
`window.__featherSketch` exposes the same inherited change/setup/save/load APIs.

Mirror textures follow the canvas drawing-buffer size at 75% resolution on each
axis, preserving the camera's aspect ratio and the renderer's capped pixel ratio.
The longest texture edge is capped at 2560 pixels (or the GPU's lower limit).
Targets resize before reflection rendering, including after window resizing,
recording-size changes and bird regeneration. Unchanged frames reuse the same
allocation; resized targets release the old GPU resources.

Version 2 supplies the missing CSG settings and migrates only the retired default
seed (1207 → 732234), gravity (9.8 → 35.1), and skin normal mode. Custom seeds,
gravity, material colors and properties, mute, palettes and camera edits survive.
Migration does not mutate the input or rewrite the user's saved file. Reset
restores the Caustic recipe and initial drop. Version 3 migrates only the previous
feather material defaults to a softer, less metallic surface; custom material
edits are preserved. Version 4 migrates the previous default drop height of 32
to 5; custom heights are preserved. Version 5 adds the saved Strudel cadence and
converts a custom legacy generation interval into bars at its saved tempo. The
old default of 36 seconds becomes six bars. Version 6 upgrades untouched stage
lighting defaults to the warmer spotlight and softer shadows, retaining custom
lighting edits. Version 7 changes only the retired default gray skin tint to
neutral white, allowing the generated colors through while preserving custom
tints and surface edits. Version 8 migrates the former paper background to black,
preserving custom background colors. Version 10 reverts the rejected version-9
widened spotlight defaults to the original position, angle and intensity. It
disables untouched shadowless fill defaults while preserving custom lighting,
bloom and camera edits. Version 11 replaces the placeholder audio with foley and
updates only untouched voice levels, attacks and the plumage low-pass default.
Sound enablement, master volume, tempo and custom voice edits are preserved.
Migration does not rewrite the saved JSON.

Development saves use owned GET/PUT requests to `/api/setup`, atomically writing
`public/settings.json` and verifying a fresh read. They never fall back to browser
storage if the API is unavailable. Published builds retain the base's separate,
URL-scoped device save behavior. Sketch identity is `12-feather` throughout.

## Verification

`npm run check` runs the production build and thirty-two tests covering:

- a backward, convergent crest on the original upper surface and isolated
  collision categories;
- exact geometry signatures against all three Caustic reference meshes;
- deterministic recovery from two known folded-mesh seeds without changing the pipeline;
- seeded finish variation, distinct resource ownership, single disposal on
  replacement, live material edits without repainting, and gray-tint migration;
- a full-sized, dynamic five-hull drop and floor landing without any body scaling;
- quick individual foot lifts, planted holds, independent head turns and upright
  stance across three different generated bodies;
- complete plumage in flight, physical flex, and persistent follicles through impact;
- opaque vanes in the double-sided AO pass and black-stage settings migration;
- ten reproducible silhouette families, size ranges, three feather layers,
  six distinct vane outlines and changing types on later cycles;
- finite render/contact geometry, continuous frames across a folding triangle,
  and stable drops and quick turns for compact, broad, trailing and tall crests;
- Strudel arrivals at exact boundaries, rests, mute, pause, tempo changes and cadence migration;
- short-drop save migration while retaining custom arrival heights;
- grounded furniture feet, matching raised mirror colliders, finite drapery
  geometry and tangent frames, cloth environment isolation, and stage-light
  migrations preserving custom edits;
- barycentric follicles matching the rendered skinned vertices through impact
  and posing, plus live Box3D damping changes;
- shared material, mirror and palette state across regenerated subjects;
- version-one save migration and preservation of custom edits;
- actual landing/foot contact timing, quiet inspection holds, bounded seeded
  foley textures, native Strudel voice limits, mute, disposal and audio migration;
- Space/click regeneration, keyboard focus, drag/pinch exclusion and input cleanup;
- complete GET/PUT setup round trips, ownership rejection and invalid-save safety.

The existing VS Code preview at **http://127.0.0.1:1235/** was checked. The lowered
drop contacted the floor at .55 seconds, wearing its complete crest from the
first frame. Side views showed the upright body, a held pose after six steps, and a
later turn toward the mirror after eighteen steps. Runtime diagnostics confirm
five dynamic skinning hulls, four body joints, and five stance motors.

Live material input changes and CSG size/seed edits survived a rebuild and
Save/Reload; the persisted file matched the reloaded setup. Reset restored size
7.2 and seed 732234. The original saved JSON was restored after testing, and the
preview was returned to its original studio settings with the new falling rig.
No server or browser tab was created by the agent. The user's visible server
continues to use port 1235.

The seven generated skin finishes were also inspected in that preview, including
their mirror reflections. Shader diagnostics reported no failed programs.
Successive replacements held GPU texture usage at 31 and program count at 29;
disposal events confirmed one material and two paint textures released per blob.
The existing roughness input changed the live finish without reallocating it,
and its value survived regeneration. Pearl highlights were softened to retain
their pastel color under the saved spotlight and bloom settings.

The real spotlight revision was checked in the full scene, including the blob,
feathers, curtains and furniture as actual shadow casters. The repeatable
browser check is `scripts/check-stage-lighting.js`: call its exported
`checkStageLighting(window.__featherSketch, THREE)` using the app's Three module.
It renders offscreen with the existing renderer, toggles shadows and the light,
then moves the actual light. It restores all materials and render state and
does not move the user's camera. At 384×384, 1,973 visible floor pixels and 1,265
curtain pixels darkened with cast shadows. Both receivers returned exactly
RGB 0,0,0 with the light off; all 48,813 sampled floor pixels outside the real
cone were also black. Moving the light changed both illumination and cast
shadows on both receivers. These checks use the real receiving materials and
occluders, rather than comparing synthetic pools on an empty plane. The normal
preview was also inspected with AO and bloom enabled.

A live Strudel arrival at generation 24 recovered from the known folded
candidate in two attempts without stopping playback or altering the saved
mesh pipeline.

The standalone release URL is https://larsberg.github.io/2026-codevember-12-feather/.
Publication metadata follows Rust: canonical and social-card URLs, a real
1600 × 900 scene thumbnail, gallery catalogue entry, and the sketch-player embed
contract. GitHub Pages uses the Actions workflow on `main`; `npm run deploy`
tests, builds, checks the release, and pushes source for that workflow.
Release preparation also includes a 30-second MP4 using the saved scene and audio
settings, with the startup frames removed, under `../recordings/`.

The plume families and automatic arrivals were checked in the existing port-1235
tab. Temporary inspection settings were restored; the saved file was untouched.

The movement foley was verified through native Strudel playback in that same tab:
multiple generations played landing, foot, pivot, brush and flutter samples while
the legacy synth-note count remained zero. Pause and mute suspended the context
and cleared the active voices; zero master volume scheduled no new samples. A
plumage-level edit survived a subject rebuild. The settings API still returned
the correct sketch ownership and version 11. A ten-second stereo output capture
is available at `.tmp/audio/feather-foley.wav`; it peaked at −20.4 dBFS at master
volume .77, with quiet gaps and no clipping. Tests also cover contact timing,
deterministic sample variation, envelope edges, voice limits and disposal.
