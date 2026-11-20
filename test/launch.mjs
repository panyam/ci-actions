// Opens a page in the browser setup-browser chose and checks it renders, so the self-test fails if
// the browser can't start headless.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
console.log(`browser ${browser.version()} from ${process.env.CHROME_PATH || "playwright-core"}`);
const page = await browser.newPage();
await page.setContent("<p id=x>ok</p>");
const text = await page.textContent("#x");
await browser.close();
if (text !== "ok") {
  console.error(`page said ${JSON.stringify(text)}, want "ok"`);
  process.exit(1);
}
