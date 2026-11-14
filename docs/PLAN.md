# Earshot — build plan

Earshot is a self-hosted web app for placing ordinary sound files around a
listener on a radar and rendering the result as binaural stereo. This document
is the plan the project was built from. Decisions taken along the way are
recorded in [DECISIONS.md](DECISIONS.md).

## Milestones

Each milestone leaves the app runnable and the test suite green.

| #   | Milestone                  | Outcome                                                                                           |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Shared maths and schema    | `packages/shared`: radar ↔ polar ↔ Web Audio coordinates, zod scene schema, migrations, WAV codec |
| 2   | Server API and storage     | Fastify REST API, atomic file storage, upload validation (size, content type, magic bytes)        |
| 3   | Radar UI and live preview  | SVG radar, drop / drag / keyboard editing, HRTF preview graph, sidebar library, inspector         |
| 4   | Export                     | Same graph in an `OfflineAudioContext`, 16/24-bit WAV download                                    |
| 5   | Settings                   | Drawer with spatial, editing, export and appearance settings plus headphone tips                  |
| 6   | Persistence polish         | Debounced autosave, save status, deep links, clip garbage collection, error toasts                |
| 7   | Docker                     | Multi-stage image, non-root, healthcheck, `compose.yaml`, smoke-test script                       |
| 8   | CI and releases            | `ci.yml`, `release-please.yml`, `publish.yml`, `codeql.yml`, Dependabot                           |
| 9   | Demo sounds and media      | Synthesised demo clips, "Load demo", `npm run media` (screenshots + GIF)                          |
| 10  | Branding and README        | Logo, favicon, hero, social preview, `BRAND.md`, README and community files                       |

## File tree

```text
earshot/
├── apps/
│   ├── server/                 Fastify API + static hosting
│   │   └── src/
│   │       ├── index.ts        entry point, graceful shutdown
│   │       ├── app.ts          buildApp(): routes, error handling, static files
│   │       ├── config.ts       environment parsing
│   │       ├── storage.ts      atomic scene + clip storage on DATA_DIR
│   │       └── sniff.ts        magic-byte audio format detection
│   └── web/                    Vite + React + TypeScript
│       ├── public/             favicon, demo clips
│       └── src/
│           ├── audio/          graph builder, live engine, offline export, clip cache
│           ├── components/     Radar, Sidebar, Inspector, Transport, Settings, …
│           ├── state/          store + actions (autosave, playback, library)
│           └── styles/         design tokens and component CSS
├── packages/
│   └── shared/                 types, zod schema, migrations, coordinate maths,
│                               acoustics helpers, WAV encoder/decoder, demo scene
├── e2e/                        Playwright: app flow + spatialisation proof
├── scripts/                    demo sound synthesis, media capture, brand assets,
│                               Docker smoke test, dev runner
├── assets/                     logo, hero banner, social preview
├── docs/                       PLAN, DECISIONS, BRAND, media/
├── .github/                    workflows, issue + PR templates, Dependabot
├── Dockerfile
└── compose.yaml
```

## Key decisions (summary)

- **Positions are stored as polar coordinates** — angle in degrees clockwise
  from front, distance in metres — because that is what both the UI and the
  audio graph want. Radar and Web Audio coordinates are derived.
- **The radar is SVG**, not Canvas: a handful of elements, free hit-testing,
  focusable and labelled dots, CSS theming.
- **One graph builder** is used for both live preview (`AudioContext`) and
  export (`OfflineAudioContext`), so what you hear is what you export.
- **The server never touches audio.** It stores scene JSON and clip files, and
  serves the built frontend. No native modules, no database.
- **The server is bundled to a single file** with esbuild, so the runtime
  image contains Node, one JavaScript file and the static frontend.
- **Audio settings are saved with each Sound**; theme and the dismissed
  headphone hint are per-browser preferences in `localStorage`.

## Testing strategy

- **Vitest**: coordinate maths, schema and migrations, WAV codec, acoustics
  helpers, and every server route through `fastify.inject` against a temp
  data directory.
- **Playwright (Chromium)**: the full user flow (create, drop, drag, reload,
  settings, export), and the spatialisation proof — a click placed hard right
  and hard left is exported through the real UI and the WAV is analysed for
  inter-aural level and time differences.
- **Docker smoke test**: build the image, run it, poll `/api/health`, upload a
  clip, tear down.
