/**
 * Copy a catalog DESIGN.md into design/active/ for agent use.
 * Usage: pnpm design-md:use <brand-folder>
 * Example: pnpm design-md:use linear.app
 */
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const catalogRoot = path.join(repoRoot, "vendor/awesome-design-md/design-md");
const activeDir = path.join(repoRoot, "design/active");

function main() {
  const brand = process.argv[2]?.trim();
  if (!brand) {
    console.error("Usage: pnpm design-md:use <brand-folder>");
    console.error("Run pnpm design-md:list to see folders under design-md/");
    process.exit(1);
  }

  const sourceDir = path.join(catalogRoot, brand);
  const sourceDesign = path.join(sourceDir, "DESIGN.md");
  if (!fs.existsSync(sourceDesign)) {
    console.error(`No DESIGN.md at ${sourceDir}`);
    process.exit(1);
  }

  fs.mkdirSync(activeDir, { recursive: true });
  fs.copyFileSync(sourceDesign, path.join(activeDir, "DESIGN.md"));
  fs.writeFileSync(path.join(activeDir, "SOURCE_BRAND.txt"), `${brand}\n`, "utf8");

  const preview = path.join(sourceDir, "preview.html");
  console.log(`Copied ${brand}/DESIGN.md → design/active/DESIGN.md`);
  if (fs.existsSync(preview)) {
    console.log(`Visual reference: vendor/awesome-design-md/design-md/${brand}/preview.html`);
  }
}

main();
