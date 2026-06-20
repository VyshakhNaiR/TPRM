import puppeteer from "puppeteer-core";

const BASE = "http://localhost:3000";
const OUT = "../docs/screenshots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = "/usr/bin/google-chrome-stable";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"],
});

async function shot(name, url, { login, prep } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem("theme", "dark"); } catch {} });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);

  if (login) {
    await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
    await page.evaluate(async (c) => {
      await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    }, login);
  }
  await page.goto(BASE + url, { waitUntil: "networkidle2" });
  await sleep(2200);
  if (prep) { await prep(page); }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name);
  await page.close();
}

const apex = { username: "apex", password: "demo" };
const dbs = { username: "dbs", password: "demo" };
const root = { username: "root", password: "demo" };

await shot("01-landing", "/");
await shot("02-login", "/login");
await shot("03-logo", "/logo");
await shot("04-onboard", "/onboard");
await shot("05-vendor", "/vendor", { login: apex });
await shot("06-console", "/console", { login: dbs, prep: async (page) => {
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Adjudicate with AI")); b && b.click(); });
  await sleep(2000);
} });
await shot("07-portfolio", "/portfolio", { login: dbs });
await shot("08-admin", "/admin", { login: root });
await shot("09-cost", "/cost", { login: dbs });
await shot("10-sbom", "/sbom", { login: dbs });

await browser.close();
console.log("done");
