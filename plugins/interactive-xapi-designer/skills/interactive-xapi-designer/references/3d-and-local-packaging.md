# True 3D interaction and local SLS packaging

Read this when using Three.js, implementing a 3D manipulative, or packaging dependencies for SLS. These requirements follow the user's cylinder-net feedback: the original separate static cylinder did not actually fold; the replacement must be visibly interactive and self-contained.

## Choose and localize the runtime

- Use Three.js when explicitly requested. Do not force 3D into activities whose learning purpose is better served by 2D.
- Download a specific release from the official Three.js distribution or npm package. Record its version and origin; include its license. Check the release's actual file layout instead of assuming older build filenames.
- Copy every required runtime file into the activity, for example under `lib/three/`. Follow transitive imports: recent `three.module.js` builds can also import `three.core.js`. Localize any controls, loaders, decoders, textures, fonts and models actually used.
- Use relative local imports, a local import map, or a build that bundles all dependencies. Do not ship unresolved bare imports or rely on an external CDN. Do not include the entire npm package unnecessarily.
- Keep `index.html` at ZIP root. Include all application code, local dependencies and licenses. Preserve existing xAPI vendor files unchanged; the 3D renderer belongs in separate application code.
- Test the extracted final ZIP over HTTP(S), as SLS serves it, rather than only testing the development directory. Native ES modules may not work when opened directly with `file://`; explain this briefly if relevant.
- Verify network requests with external asset access blocked: the activity must render and work without CDN access. SLS/LRS traffic is a separate, expected integration dependency, not an asset-localization failure.

## Build a genuine spatial model

- Use real mesh geometry, a 3D camera, depth-tested rendering, lighting and suitable materials. Allow learners to inspect the solid with drag/touch rotation, zoom and a reset-view control, with keyboard equivalents.
- Keep dimensions and mathematical relationships consistent across the flat net and folded solid. Never make an invalid net look valid by silently resizing a circle or stretching the rectangle.
- For cylinder nets, roll the same rectangle into the lateral surface and hinge the same two circular ends into place. Provide an explicit reverse unfold control. Preserve radius, height and wrap length throughout the transformation.
- Visualize gaps, overlaps and unequal ends accurately. Distinguish conceptual modelling assumptions, such as ideal paper and omission of glue tabs, from physical folding claims.
- Keep camera inspection separate from folding state. Rotating or zooming the camera must not change answers, dimensions or score. Avoid tracking every frame or pointer movement; record meaningful fold, test, revision and explanation events through the existing payload layer.
- Cancel or replace active animation safely when learners reverse direction, reset, change dimensions or move to another mission. Honor reduced motion by reaching the same correct end geometry without prolonged animation.
- Provide useful feedback when WebGL is unavailable instead of a blank or silently static canvas. Do not claim that a fallback has passed real 3D checks.

## Verify before claiming completion

1. Inspect the initial flat geometry, an intermediate fold frame, the fully folded model and the returned unfolded net. A changed label, numeric animation value or initial screenshot alone is insufficient.
2. Rotate the completed solid to inspect its curved wall and both ends. Exercise pointer/touch controls, keyboard rotation/zoom and reset view.
3. Test valid and invalid dimensions, changing parameters after a fold, rapid fold/unfold actions, mission transitions, reset and reload.
4. Check desktop and mobile layouts, reduced motion, console errors, clipping and missing resources. Verify the final archive contains all imported files and licenses and can run without remote asset requests.
5. Rerun the learning path and inspect actual xAPI state and score output. Keep the sample transport unchanged and confirm its checksums. Separate renderer success, local mock-LRS success and real SLS launch verification in the handoff.

When the user asks to update the plugin from a repair, first verify the repair, then capture the reusable requirement. Do not turn untested implementation assumptions into claims of success.
