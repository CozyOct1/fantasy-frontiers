import { chromium } from "@playwright/test";
import { mkdir, readdir, readFile } from "node:fs/promises";

const collections = [
  ["assets/library/border-outpost", "assets/library/border-outpost/runtime"],
  ["assets/library/neutral", "assets/library/neutral/runtime"],
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const [source, target] of collections) {
    await mkdir(target, { recursive: true });
    for (const name of await readdir(source)) {
      if (!name.endsWith(".svg")) continue;
      const svg = await readFile(`${source}/${name}`, "utf8");
      const root = svg.match(/<svg\b([^>]*)>/)?.[1] ?? "";
      const explicitWidth = Number(root.match(/\bwidth="(\d+)"/)?.[1]);
      const explicitHeight = Number(root.match(/\bheight="(\d+)"/)?.[1]);
      const viewBox = root.match(/\bviewBox="[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)"/);
      const width = explicitWidth || Number(viewBox?.[1]) || 128;
      const height = explicitHeight || Number(viewBox?.[2]) || 128;
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      await page.setViewportSize({ width, height });
      await page.setContent(`<html><body style="margin:0;background:transparent"><img id="art" src="${dataUrl}" style="display:block;width:${width}px;height:${height}px" /></body></html>`);
      await page.locator("#art").evaluate(image => image.decode());
      await page.locator("#art").screenshot({ path: `${target}/${name.replace(/\.svg$/, ".png")}`, omitBackground: true, animations: "disabled" });
    }
  }
} finally {
  await browser.close();
}
