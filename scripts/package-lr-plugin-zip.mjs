/**
 * Buduje jeden plik ZIP dla klienta: INSTALL.txt + MindfulLensFilmEngine.lrplugin/
 * Uruchom z root repo: node scripts/package-lr-plugin-zip.mjs
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/** Remove AppleDouble files so client ZIP stays clean on non-APFS uploads. */
function removeAppleDoubleRecursive(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.name.startsWith("._")) {
      try {
        unlinkSync(p);
      } catch {
        /* ignore */
      }
      continue;
    }
    if (e.isDirectory()) {
      removeAppleDoubleRecursive(p);
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const bundleSrc = join(root, "lrplugin", "MindfulLensFilmEngine.lrplugin");
const infoPath = join(bundleSrc, "Info.lua");
const installTxtSrc = join(__dirname, "lr-plugin-client-install.txt");

function parseInfoLua(text) {
  const major = Number(text.match(/major\s*=\s*(\d+)/)?.[1] ?? 0);
  const minor = Number(text.match(/minor\s*=\s*(\d+)/)?.[1] ?? 0);
  const revision = Number(text.match(/revision\s*=\s*(\d+)/)?.[1] ?? 0);
  const build = Number(text.match(/build\s*=\s*(\d+)/)?.[1] ?? 0);
  return { major, minor, revision, build };
}

function main() {
  if (!existsSync(bundleSrc)) {
    console.error("package-lr-plugin-zip: missing bundle:", bundleSrc);
    console.error("Run: npm run sync:lr-plugin");
    process.exit(1);
  }

  const infoText = readFileSync(infoPath, "utf8");
  const v = parseInfoLua(infoText);
  const verTag = `${v.major}.${v.minor}.${v.revision}-b${v.build}`;
  const stagingRoot = join(root, "dist", "lr-plugin-client-bundle");
  const innerName = `Analog-Signature-Lightroom-${verTag}`;
  const innerDir = join(stagingRoot, innerName);

  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(innerDir, { recursive: true });

  cpSync(bundleSrc, join(innerDir, "MindfulLensFilmEngine.lrplugin"), { recursive: true });

  const installBody = existsSync(installTxtSrc)
    ? readFileSync(installTxtSrc, "utf8")
    : "See vendor documentation.\n";
  writeFileSync(
    join(innerDir, "INSTALL.txt"),
    `Analog Signature — bundle ${verTag}\n${"=".repeat(48)}\n\n${installBody}`,
    "utf8",
  );

  removeAppleDoubleRecursive(innerDir);

  mkdirSync(join(root, "dist"), { recursive: true });
  const zipName = `Analog-Signature-Lightroom-${verTag}.zip`;
  const zipPath = join(root, "dist", zipName);
  rmSync(zipPath, { force: true });

  execFileSync("zip", ["-r", "-y", zipPath, innerName], {
    cwd: stagingRoot,
    stdio: "inherit",
  });

  console.log(`package-lr-plugin-zip: wrote ${zipPath}`);
}

main();
