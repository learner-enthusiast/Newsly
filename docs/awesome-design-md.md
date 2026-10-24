# Awesome DESIGN.md catalog

This repo vendors [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) at `vendor/awesome-design-md/` (git submodule). It ships **74** ready-made `DESIGN.md` files (plus `preview.html` / `preview-dark.html` per brand) for AI-assisted UI work.

## Update the catalog

```bash
git submodule update --remote vendor/awesome-design-md
```

Fresh clones:

```bash
git submodule update --init --recursive
```

## Pick a design system

```bash
pnpm design-md:list
pnpm design-md:use linear.app   # copies into design/active/
```

Then open `vendor/awesome-design-md/design-md/<brand>/preview.html` in a browser to compare swatches, type, and components.

## How to use with Cursor / Claude

| Goal | What to do |
|------|------------|
| **New page or section in a specific brand look** | Run `pnpm design-md:use <brand>`, then prompt: *“Build \<page\> following `design/active/DESIGN.md`; keep existing Next.js/shadcn structure.”* |
| **One-off experiment** | @-mention `vendor/awesome-design-md/design-md/notion/DESIGN.md` (or any brand) in chat without copying. |
| **This app’s default look** | Keep using `app/globals.css`, `lib/fonts.ts`, and shadcn components. Only adopt a catalog `DESIGN.md` when you intentionally want a **visual pivot** (marketing lander, prototype, etc.). |

`DESIGN.md` is the visual contract (tokens, typography, motion, “never do” rules). `AGENTS.md` stays the build contract (Next.js, Prisma, Inngest, etc.). Use both when redesigning UI.

## Good fits for Newsly

Editorial / product-adjacent catalogs in the vendor tree:

- **`linear.app`** — crisp product UI, strong hierarchy (good for dashboards and dense news tools).
- **`notion`** — readable, document-first (articles, briefings).
- **`mintlify`** — dev-docs aesthetic (help, about, pricing-style pages).
- **`framer`** — marketing motion and hero sections (landing experiments).
- **`claude`** / **`cursor`** — familiar AI-product patterns if you add assistant chrome.

Always treat catalog files as **reference tokens**, not a license to clone a brand’s trademark identity in production.

## Submodule layout

```
vendor/awesome-design-md/
  README.md
  design-md/
    <brand>/
      DESIGN.md
      preview.html
      preview-dark.html
```

Active copy (when you run `design-md:use`; not committed by default):

```
design/active/
  DESIGN.md          # agent reads this
  SOURCE_BRAND.txt   # which catalog entry was copied
```

Add `design/active/DESIGN.md` to `.gitignore` if you treat it as a local preference only.
