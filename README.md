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
VS Code browser tab. `H` reveals the inherited controls drawer, `Space` pauses,
and `M` toggles Strudel audio. Left-drag orbits, right-drag pans, and scroll zooms.
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

Each creature owns a generated `MeshPhysicalMaterial` from `glamour-material.js`.
Seven finish families—nacre, ribbon lacquer, petrol pearl, opal marble, gilt
pinstripe, confetti enamel and holographic satin—cycle independently of the six
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

`plumage-layout.js` provides six coherent surface flow fields (+Z front, −Z rear):
a convergent swept crest, a graduated rear fan, a side sweep, a parted double
crest, an upright arched fan, and a long cascading crest. Seeded spread, handedness,
arch height, length and vane profiles vary within each family. Short coverts
blend into longer feathers according to height, front-to-back position or side.
Each feather is a curved,
cambered, asymmetric vane with a broad lower section and pointed tip. All color
variants retain full vanes. Smooth normals, fine shader barbs and a dark central
rachis replace the detached bright wire strands. Each crest uses a coherent
palette, with darker distal colors.

Kinematic follicle frames drive the dynamic feathers with restricted angular
movement. Three thin convex sections follow each curved vane, allowing shingled
layering; separate collision categories keep them clear of the body's overlapping
internal hulls. The body remains fully dynamic. Contact envelopes cover the
central vane, so fine edge overlaps remain an approximation. The whole crest
arrives fully formed, with no scale or growth animation. Lightly damped restoring
torque gives the vanes bounce at impact and follow-through during steps and head turns.

`generation-score.js` uses the actual Strudel core pattern engine. The saved
`cadence` contains `bars` (phrase length, four beats per bar) and `rhythm` (`x`
for arrivals and `.` for rests, evenly spaced across the phrase). For example,
`{ "bars": 8, "rhythm": "x.x." }` introduces a creature every four bars. The
existing saved audio tempo supplies BPM. No new controls or musical patch were
added. The visual pattern works while muted and before audio is unlocked.

The phase persists across automatic generations, follows tempo changes without
restarting, and freezes with the sketch or hidden tab. Initial onset zero belongs
to the first creature, preventing a duplicate arrival. Manual regeneration,
Reload and Reset restart the phrase. Audio events use the same continuous beat
position, ready for a future sound direction.

`dressing-room.js` raises the mirror glass three units above the floor. Six
turned walnut legs, brass collars, curved front/back shoes and lower stretchers
support the moulded gilt frames. Shared panel transforms keep Box3D's raised
panels and foot colliders aligned with the visible furniture, including when
the mirror fold changes. The space underneath the glass is open.

The red satin drapery consists of a pleated backdrop, two gathered side curtains
with tieback cords, three scalloped swags and a sewn heading. These are curved meshes with
actual folds, normals and tangent frames. A physical cloth material supplies
anisotropic highlights and satin sheen; the folds cast and receive shadows.

The inherited spotlight now aims at the dressing floor, with a warm pool of
light and a wide cone penumbra. Its existing Soft edge and Shadow softness
controls separately adjust the light falloff and filtered cast-shadow edge.
The black stage floor's pool uses that same spotlight position, direction, cone,
penumbra, color and intensity, while receiving the actual scene shadow map.
It has no ambient contribution: the pool fades to pure black outside the cone,
and disabling the spotlight leaves the floor black. Cast shadows multiply that
light instead of adding a colored shadow to the unlit floor. The background is black.
Opaque feather vanes participate in the AO depth and normal pass on both sides,
preventing the mirror frame's occlusion shading from appearing through them.
No extra lamp controls or overlays were introduced.

The three planar mirrors, feather contacts, Strudel audio transport, studio,
palette workshop, material editors, effects, camera and owned settings API are
retained. No new overlay, panel, or subject controls were added. New persisted
`mesh` and `pipeline` settings use the existing setup schema and player bridge.
`window.__featherSketch` exposes the same inherited change/setup/save/load APIs.

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
preserving custom background colors. Migration does not rewrite the saved JSON.

Development saves use owned GET/PUT requests to `/api/setup`, atomically writing
`public/settings.json` and verifying a fresh read. They never fall back to browser
storage if the API is unavailable. Published builds retain the base's separate,
URL-scoped device save behavior. Sketch identity is `12-feather` throughout.

## Verification

`npm run check` runs the production build and twenty-two tests covering:

- a backward, convergent crest on the original upper surface and isolated
  collision categories;
- exact geometry signatures against all three Caustic reference meshes;
- seeded finish variation, distinct resource ownership, single disposal on
  replacement, live material edits without repainting, and gray-tint migration;
- a full-sized, dynamic five-hull drop and floor landing without any body scaling;
- quick individual foot lifts, planted holds, independent head turns and upright
  stance across three different generated bodies;
- complete plumage in flight, physical flex, and persistent follicles through impact;
- opaque vanes in the double-sided AO pass and black-stage settings migration;
- six reproducible silhouette families with length gradients and different directions;
- Strudel arrivals at exact boundaries, rests, mute, pause, tempo changes and cadence migration;
- short-drop save migration while retaining custom arrival heights;
- grounded furniture feet, matching raised mirror colliders, finite drapery
  geometry and tangent frames, plus stage-light migration preserving custom edits;
- barycentric follicles matching the rendered skinned vertices through impact
  and posing, plus live Box3D damping changes;
- shared material, mirror and palette state across regenerated subjects;
- version-one save migration and preservation of custom edits;
- Strudel beat-boundary onsets;
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

The stage revision was checked with AO enabled and all 64 vanes writing
double-sided normals and depth. An isolated GPU floor readback sampled decreasing
linear intensities of 204, 154, 13 and 0 through the spotlight falloff; outside
the cone and with the spotlight disabled, the floor returned exactly RGB 0,0,0.

Publication metadata has no deployment URL yet. Capture a gallery thumbnail
from the approved scene before publishing; the release check guards those assets.

The plume families and automatic arrivals were checked in the existing port-1235
tab. Temporary inspection settings were restored; the saved file was untouched.
