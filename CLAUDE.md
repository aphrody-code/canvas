# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ce qu'est ce repo

Fork de `@napi-rs/canvas` (Brooooooklyn/canvas) republié sous le nom **`@aphrody-code/canvas`** vers **GitHub Packages** (`https://npm.pkg.github.com`). Binding Node-API Rust → Skia (`chrome/m148`) qui implémente l'API Canvas 2D + Path2D + PDF + SVG + GIF + Lottie pour Node.js/Bun, **sans dépendance système** (Skia est compilée en static lib et liée).

Submodule `packages/` du monorepo `~/vps` (cf. `~/vps/CLAUDE.md` pour le contexte global, services, etc.). Consommé par `rg-bot`, `shenron`, `gacha`.

## Commits du fork (différences vs upstream)

- `0eca13f`/`c3feaac` : rebrand `@napi-rs/canvas` → `@aphrody-code/canvas` + 11 sub-packages npm (`npm/<triple>/package.json`), patch `js-binding.js` loader, CI publish vers GitHub Packages.
- `dd64e55`/`a07d9ca`/`8d1dbae` : migration n2b `node` → `bun` (préfixe `node:`, `__dirname` → `import.meta.dir`, `Bun.$` dans `scripts/build-*`, `colorette` → ANSI inline).
- `46a965b` (HEAD, `0.1.99-fork.4`) : recompile binaire skia avec libc++ ABI (cf. `scripts/build-c++abi.mjs` et `.github/workflows/libcxxabi.yml`).
- `df9e4bd` : `workflow_dispatch` ajouté pour trigger manuel — **les Actions ne tournent pas automatiquement sur les forks**, il faut déclencher à la main.

`upstream` = `Brooooooklyn/canvas`, `origin` = `aphrody-code/canvas`. Resync upstream possible mais conserver le rebrand + le patch `js-binding.js`.

## Architecture

```
src/             # Crate Rust → cdylib → skia.<triple>.node
  lib.rs         # entry NAPI : exporte CanvasRenderingContext2D, Path, GlobalFonts, Image,
                 # PdfDocument, GifEncoder, LottieAnimation, SVGCanvas, ImageData…
  ctx.rs         # implémentation du contexte 2D (le gros morceau)
  sk.rs          # wrappers Skia (ColorSpace, SurfaceRef, SkiaDataRef)
  path.rs path2d # PathKit / Path2D / PathOp / FillType
  font.rs global_fonts.rs  # FontKey, FONT_REGEXP, GlobalFonts (register/families/has)
  avif.rs gif.rs svg.rs    # encoders
  lottie.rs                # LottieAnimation (load + render to canvas)
  image.rs filter.rs gradient.rs pattern.rs state.rs error.rs
  page_recorder.rs picture_recorder.rs

skia-c/skia_c.{cpp,hpp}    # bridge C++ entre Rust et Skia (compilé via cc-rs)
skia/                      # submodule google/skia.git
depot_tools/               # submodule rust-skia/depot_tools (utilisé par build-skia.js)

build.rs                   # cc-rs : compile skia_c.cpp + link static libskia.a
                           # CC=clang CXX=clang++ par défaut, clang-cl sur windows
                           # Android : utilise ANDROID_NDK_LATEST_HOME

index.js                   # entry npm : require('./js-binding') puis enrichit (Symbol.dispose
                           # sur GifEncoder, GlobalFonts.families/has, SvgExportFlag, etc.)
js-binding.js              # auto-généré NAPI-RS, patché pour le fork :
                           # require('@aphrody-code/canvas-<triple>') au lieu de @napi-rs/...
geometry.js                # DOMPoint, DOMMatrix, DOMRect (JS pur)
load-image.js              # loadImage(url|path|Buffer) → Image
node-canvas.{js,d.ts}      # shim de compat node-canvas (createCanvas, registerFont)
index.d.ts                 # types TS exposés (34 KB, source de vérité de l'API)

npm/<triple>/              # 11 sub-packages publiés en optionalDependencies
                           # contiennent juste skia.<triple>.node + package.json
                           # Triples : x64/arm64 × {gnu,musl} linux, darwin, msvc, android,
                           # armv7-gnueabihf, riscv64-gnu

__test__/*.spec.ts         # tests AVA (canvas-class, draw, filter, image, image-data, gif,
                           # global-fonts, pathkit, lottie, node-canvas-compat, etc.)
example/                   # tiger.js (démo), lottie-to-video.ts
benchmark/bench.ts         # vs canvas, skia-canvas, canvaskit-wasm
e2e/                       # webpack bundling test (`bun --filter @napi-rs/canvas-e2e-webpack`)
```

**Frontière critique** : `js-binding.js` (auto-généré) charge le `.node` depuis `@aphrody-code/canvas-<triple>` en optionalDependency, OU depuis `./skia.<triple>.node` à la racine si présent. Toute regen via `napi build` réécrit ce fichier — le patch fork doit être réappliqué (le rebrand est déjà appliqué dans le fichier commité).

## Commandes courantes

```bash
# Build addon Rust pour le host (sortie skia.<host-triple>.node + js-binding.js)
bun run build           # release
bun run build:debug     # debug

# Tests AVA (utilise @oxc-node/core pour TS)
bun run test            # parallèle
bun run test:ci         # ava -c 1 (séquentiel)
bun test __test__/draw.spec.ts   # un seul fichier (passer en arg ava)

# Lint + format
bun run lint            # oxlint
bun run format          # prettier + cargo fmt + taplo (TOML)
cargo fmt -- --check
cargo clippy

# Bench
bun run bench           # benchmark/bench.ts (tinybench)

# E2E webpack
bun run e2e
```

### Build Skia (rare — seulement si on touche skia-c, GN args, ou bump submodule)

```bash
# Pull binaire pré-compilé (matche le hash du submodule skia/)
bun scripts/release-skia-binary.mjs --download
bun scripts/release-skia-binary.mjs --download --target=aarch64-apple-darwin

# Compiler Skia from source (long ; nécessite clang/llvm/lld locaux)
bun scripts/build-skia.js                                # host
bun scripts/build-skia.js --target=aarch64-apple-darwin  # cross
```

`scripts/build-skia.js` wrappe `gn gen` + `ninja` via `depot_tools/`. La version LLVM ciblée est dans `./llvm-version` (actuellement `19.1.7`). Pour les targets musl/android Skia est buildée avec libc++ statique recompilée via `scripts/build-c++abi.mjs` (CI workflow `libcxxabi.yml`).

### Publish (CI uniquement)

CI `CI.yaml` publie via `napi prepublish -t npm` vers `https://npm.pkg.github.com` avec `GITHUB_TOKEN`. `.npmrc` configure `@aphrody-code:registry` + `always-auth`. **Sur les forks, GitHub Actions ne s'exécute pas automatiquement** → utiliser `workflow_dispatch` (Actions tab → Run workflow).

## Conventions Rust

- `cargo fmt` + `cargo clippy` obligatoires (CI strict).
- `rust-toolchain.toml` épinglé à `1.94.1` (edition 2024, resolver 3).
- `crate-type = ["cdylib"]`, allocator global = `mimalloc-safe` avec features adaptées par target (`local_dynamic_tls` sur linux, `no_opt_arch` sur aarch64).
- `napi 3.1` (features `napi5 web_stream serde-json`), `napi-derive 3.1`, async via tokio (mpsc channel + ReceiverStream pour streaming PDF/encode).
- Tout nouvel encoder : exposer via `#[napi]` dans son module + `mod xxx; pub use xxx::*;` dans `lib.rs`.
- C++ formaté `clang-format --style=Chromium` (CI job dédié).

## Conventions JS/TS

- Le seul package manager utilisé est **bun** (cf. n2b migration). Pas de `node`/`npm`/`yarn` même si la CI upstream parle de yarn — sur ce fork tout passe par bun.
- `index.js` est CJS — préserver `require()` pour rester compatible Node ≥ 10.
- Scripts `scripts/*.mjs` : Bun-native, peuvent utiliser `Bun.$`, `import.meta.dir`, `node:fs`/`node:os`/`node:path` avec préfixe.
- Types : `index.d.ts` est source de vérité ; toute nouvelle API NAPI doit être typée ici (pas auto-généré).
- Tests : AVA + `@oxc-node/core/register` pour TS direct, `--import core-js/proposals/promise-with-resolvers.js` pour `Promise.withResolvers`.

## Pièges connus

- **`js-binding.js` regénéré écrase le rebrand** : après `napi build` le fichier est réécrit. Le commit `c3feaac` contient le patch ; vérifier `grep '@aphrody-code' js-binding.js` après chaque build, repatcher si besoin (les `require('@napi-rs/canvas-<triple>-<libc>')` doivent devenir `@aphrody-code/canvas-<triple>-<libc>`).
- **`optionalDependencies`** dans `package.json` : ne lister QUE le triple host courant (linux-x64-gnu) sinon `bun install` essaie de résoudre les 11 sub-packages publiés sur GH Packages et peut échouer auth si `GITHUB_TOKEN` absent. Pour publish complet la CI gère ça via `napi prepublish`.
- **HarfBuzz woff2 segfault sur certaines targets** (musl, win-arm64-msvc, etc.) : Skia m148 introduit un path table-based pour le sous-ensemble PDF qui crashe sur woff/woff2. Workaround documenté en commentaire long en haut de `scripts/build-skia.js`. Ne pas supprimer.
- **`build.rs` set `CC`/`CXX` via `unsafe`** (edition 2024) : les `env::set_var` sont en blocs `unsafe` — c'est volontaire, ne pas refactorer.
- **Submodules** : `skia/` (~2 GB) et `depot_tools/` doivent être init avec `git submodule update --init --recursive` avant tout build from source. Pour développement bindings-only on peut s'en passer si on a téléchargé un binaire pré-build.

## Intégration monorepo `~/vps`

- Submodule `packages/canvas` du monorepo (cf. `~/vps/.gitmodules` → `aphrody-code/canvas`).
- Consommé par : `rg-bot` (cards Discord), `shenron` (rendering), `gacha` (cartes/posters Beyblade).
- `*.node` est gitignored : aucun binaire n'est commité. La diffusion passe par GitHub Packages via la CI `workflow_dispatch` (`napi prepublish -t npm`). Localement, après `bun run build` on a `skia.linux-x64-gnu.node` à la racine ; `cp` vers `npm/linux-x64-gnu/` avant publish.
- Lors d'un bump : (1) `bun run build` localement, (2) `cp skia.linux-x64-gnu.node npm/linux-x64-gnu/`, (3) bump `version` dans `package.json` + `npm/linux-x64-gnu/package.json` (et l'`optionalDependencies` du root vers le même tag), (4) `git push` sur `origin/main`, (5) déclencher `workflow_dispatch` pour publier les 11 sub-packages sur GH Packages, (6) `bun update @aphrody-code/canvas` côté apps consommatrices.
