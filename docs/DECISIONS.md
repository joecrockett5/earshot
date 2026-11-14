# Decisions

Choices made while building Earshot, with the reasoning, so they can be revisited rather than rediscovered. Newest sections are not necessarily last; the list is grouped by area.

## Product and audio

### Positions are stored as angle and distance

A source's position is `angle` (degrees clockwise from straight ahead, `[0, 360)`) and `distance` (metres). That is how people describe where a sound is ("behind me, a couple of metres"), how the inspector reads it out, and what Shift-snapping and keyboard nudging operate on. Cartesian coordinates are derived when needed.

### Radar to Web Audio mapping

The Web Audio listener sits at the origin, facing −Z with +Y up (the API's defaults, set explicitly). A source at angle θ and distance d is placed at `x = d·sin θ`, `y = 0`, `z = −d·cos θ`. So radar-up is −Z (ahead), radar-right is +X, radar-down is +Z (behind). The mapping and its inverse live in `packages/shared/src/coords.ts` and are tested for every cardinal direction and for round trips.

### Sources cannot sit exactly on the listener

Distance is clamped to at least 0.25 m. At zero distance direction is undefined and the panner's output jumps around.

### The distance models share one reference distance, with tuned roll-off

`refDistance` is 1 m for every model. Roll-off is 1 for `inverse` (the physical inverse-distance law), 1.5 for `exponential`, and 0.9 for `linear` so that a source on the outer ring is quiet but not silent. The panner's `maxDistance` follows the radar radius.

### Distance also dulls a sound

Each source passes through a low-pass filter whose cutoff falls from 20 kHz at 1 m towards 1.5 kHz far away. It is deliberately subtle: level alone makes a distant sound seem quiet rather than far.

### Reverb is synthetic and deterministic

The impulse response is exponentially decaying, progressively darker noise with a short pre-delay and decorrelated left and right channels, generated from a seeded random number generator. It needs no third-party recordings, and preview and export produce the same room every time. Nearer sources send slightly more to the reverb in absolute terms but less relative to their direct sound, which is what makes distance audible.

### Export is the same graph, rendered offline

`buildGraph` constructs the audio graph for any `BaseAudioContext`. Live preview passes an `AudioContext`; export passes an `OfflineAudioContext`. There is one implementation, so what you export is what you heard.

### Export length includes a reverb tail

**Deviation from the brief.** The brief says the export ends at the end of the last non-looping clip. With reverb on, cutting there chops the tail off audibly, so 1.5 s is added when the reverb amount is above zero. With reverb off the length is exactly the end of the last clip. If anything loops, the length is the user's "Length with loops" setting, as specified.

### Export protects against clipping

Several sources close to the listener can sum above full scale. If the rendered peak exceeds 0.999 the whole file is scaled down to fit and the app says so, instead of writing a distorted file.

### Sound-shaping settings are saved per Sound

Panning model, distance model, radar radius, reverb, export format, snap angle and loop length are stored in the scene, because they change how that scene sounds and an exported file should be reproducible later. Theme and the dismissed headphone hint are preferences of the person at the browser, so they live in `localStorage`.

### Clip duration is stored with each source

The decoded duration is saved on the source when a clip is added. The scene's length can then be shown, and the sidebar can count sources, without downloading and decoding audio.

## Front end

### The radar is SVG, not Canvas

A scene has at most a few dozen sources, so drawing speed is irrelevant, and SVG gives things Canvas would have to rebuild by hand: every dot is a real element that can take keyboard focus, carry an ARIA label, receive pointer events and be found by tests; text stays crisp at any zoom; and theming is plain CSS. The SVG is drawn at one unit per CSS pixel (measured with a `ResizeObserver`) so strokes and labels stay the same size as the radar grows.

### Dots are focusable buttons with their own keys

Arrow keys rotate the focused source in 5° steps and Shift+arrows move it nearer or farther. Right/Up mean clockwise/farther; Left/Down mean anticlockwise/nearer.

### A small hand-written store instead of a state library

Application state is one object with `get`, `set` and `subscribe`, read by components through `useSyncExternalStore`. The audio engine and autosave need to read and change state outside React, which this makes trivial, and it avoids a dependency. Runtime dependencies of the web app are React and zod.

### Plain CSS with custom properties

Two files: tokens (colours, type, radii, per theme) and components. No CSS framework, no web fonts. The app uses the system UI font and the system monospace font for numbers, so it loads instantly and works offline.

### The inspector floats over the stage

It appears at the top right only while a source is selected, rather than reserving a column that is empty most of the time. On narrow screens it becomes a bottom sheet, and the sidebar becomes a drawer.

### Settings use the native `<dialog>` element

It provides focus trapping, Escape to close, and inertness of the page behind it without any library.

### Autosave, not a Save button

Changes are written 400 ms after the last edit, and immediately when the page is hidden (using `fetch` with `keepalive`). The header shows the save state.

### Ids come from `crypto.getRandomValues`

`crypto.randomUUID` only exists in secure contexts, and Earshot is typically opened over plain HTTP on a LAN address. Ids are 32 hex characters and are validated with the same pattern on client and server.

### "Load demo" uses the ordinary upload path

The demo clips are static files shipped with the web app. Loading the demo fetches them and uploads them like any dropped file, so the server has no special demo code and the demo exercises the real path.

## Server and storage

### Files, not a database

Scenes are `scenes/<id>.json`; clips are `clips/<id>.<ext>`. Writes go to a temporary file in the same file system, are flushed, then renamed into place, so a crash never leaves a half-written scene. There are no native modules, so the image is the same on every architecture, and a backup is a copy of one folder.

### Clip files are identified by content, never by name

The server reads the first bytes of an upload and accepts it only if they identify WAV, MP3, OGG, FLAC or MP4/M4A audio (and also AAC and WebM audio, which browsers decode equally well). The stored extension and the `Content-Type` served later come from that detection. The uploaded file name is not used for anything on the server.

### Unused clips are deleted automatically

When a Sound is saved or deleted, any clip it used to reference that no Sound references any more is removed. Duplicated Sounds share clip files. `DELETE /api/clips/:id` refuses with 409 while a clip is still in use.

### Scene versioning

Every scene has a `version`. `migrateScene` walks a table of migrations from the stored version to the current one before validating; a scene from a newer version of Earshot is rejected with a clear message instead of being silently damaged. There are no migrations yet; the hook and its tests exist so the first one is easy.

### The server is bundled into one file

esbuild bundles the server and its dependencies into a single `index.cjs`. The runtime image therefore contains Node, that file and the static front end, and no `node_modules`.

### No authentication

By design, as the brief requires. This is stated in the README and in `SECURITY.md`, with the supported ways to run it safely.

## Container

### The entrypoint starts as root, then drops to uid 1000

**Deviation from a strict reading of "non-root".** The brief asks for both a non-root runtime and a quick start that is only a compose file with `./data:/data`. On Linux, Docker creates a missing bind-mount directory owned by root, which an unprivileged process cannot write to. So the entrypoint does exactly one thing as root, fixing ownership of the data directory, and then `exec`s the server through `su-exec` as the `node` user. The server never runs as root (the smoke test checks this). This is the same approach the official Redis and Postgres images take. Running with `--user`/`user:` skips the step entirely.

### Built once, copied to each architecture

The build stage runs on the builder's native platform, because its output is JavaScript and static files. Only the small runtime stage is built per target, which keeps multi-arch builds fast and avoids running npm under emulation.

## Tooling and releases

### TypeScript is pinned to 6.0

typescript-eslint did not yet support newer TypeScript when the project was set up.

### Node 24 in production, Node 22 or later to develop

`.nvmrc` and the image use Node 24 LTS. `engines` allows 22 and later because nothing in the code needs more, and it keeps contributing easy.

### End-to-end tests run against the production build

Playwright starts the bundled server serving the built front end from a temporary data directory, so the tests cover what is shipped, including static file serving.

### The spatialisation test analyses a real export

It places a click at 90° and at 270°, exports through the real user interface, and decodes the downloaded WAV in the test process. It asserts that the near ear is louder (by RMS) and earlier (by onset), and that the delay between ears is a plausible fraction of a millisecond.

### Publishing is triggered directly by release-please

A release created by the default `GITHUB_TOKEN` does not start workflows that listen for `release` events. So the release-please workflow calls the publish workflow itself when it creates a release. The publish workflow still listens for `release: published` (for releases made by a person) and can be run by hand for a given tag.

### One version for the whole repository

The workspace packages are private and released together, so release-please manages one version and updates the workspace `package.json` files to match. The server reports that version at `/api/health`.

### Generated assets are committed

Demo clips, brand assets, screenshots and the GIF are produced by scripts (`npm run demo:sounds`, `brand`, `media`) and committed, so the README works on GitHub and the Docker build needs no extra tools.
