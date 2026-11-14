# Contributing to Earshot

Thank you for taking the time. Bug reports, ideas and pull requests are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach before you spend time on it.
- Check the roadmap in the [README](README.md#roadmap). Some things are out of scope on purpose.
- Earshot aims to stay small: few dependencies, no database, no native modules. Changes that keep it that way are easier to accept.

## Setting up

You need Node.js 24 (see `.nvmrc`) and npm.

```bash
npm install
```

```bash
npm run dev
```

The app is then at <http://localhost:5173>, with data stored in `./data`.

## Making a change

1. Branch from `main`.
2. Make the change, with tests. Maths, schema and server behaviour get unit tests (Vitest). Things a user does get an end-to-end test (Playwright, in `e2e/`).
3. Run the checks that CI runs:

   ```bash
   npm run lint && npm run format:check && npm run typecheck && npm test && npm run e2e
   ```

4. If you touched anything audible, listen to it on headphones. The spatialisation test proves left and right; only ears can judge whether it sounds good.
5. If you changed how something works or why, add a short entry to [docs/DECISIONS.md](docs/DECISIONS.md).
6. If you changed the look of the app, run `npm run media` and commit the new screenshots.

## Commits and pull requests

Commit messages and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(web): add a mute button to the inspector
fix(server): reject clips with a zero-length body
docs: explain the distance models
```

This matters: [release-please](https://github.com/googleapis/release-please) reads them to write the changelog and choose the next version number. `feat` produces a minor release and `fix` a patch release.

Keep pull requests focused on one thing, and fill in the template.

## Releases

Maintainers do not tag releases by hand. Merging to `main` updates a release pull request; merging that pull request creates the GitHub Release and publishes the container image.

## Code of conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
