// scrape.js -- fetch a page with a real browser, embed all images as base64
// usage: node scrape.js <url> <output.html>
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const url_mod = require('url');

const [,, url, outfile] = process.argv;
if (!url || !outfile) {
  console.error('usage: node scrape.js <url> <output.html>');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // look like a real browser
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });

  console.log('fetching:', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // wait for images to settle
  await new Promise(r => setTimeout(r, 2000));

  // embed every image as base64 in-place
  const embedded = await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.all(imgs.map(async img => {
      const src = img.src;
      if (!src || src.startsWith('data:')) return;
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        const reader = new FileReader();
        await new Promise(resolve => {
          reader.onloadend = resolve;
          reader.readAsDataURL(blob);
        });
        img.src = reader.result;
      } catch(e) {
        console.warn('could not embed:', src, e.message);
      }
    }));
    return document.documentElement.outerHTML;
  });

  // also inline any remaining external stylesheets as <style> blocks
  const finalHtml = `<!DOCTYPE html>\n` + embedded;
  fs.writeFileSync(outfile, finalHtml, 'utf8');
  console.log(`saved: ${outfile} (${(fs.statSync(outfile).size/1024).toFixed(1)} KB)`);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
