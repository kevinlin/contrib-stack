import { readFileSync } from "fs";
import { gzipSync } from "zlib";

const MAX_GZIP_BYTES = 15 * 1024;
const raw = readFileSync("dist/widget.js");
const gzipped = gzipSync(raw);

const sizeKB = (gzipped.length / 1024).toFixed(2);
console.log(`widget.js: ${raw.length} bytes raw, ${gzipped.length} bytes gzip (${sizeKB} KB)`);

if (gzipped.length > MAX_GZIP_BYTES) {
  console.error(`FAIL: gzip size ${gzipped.length} exceeds budget ${MAX_GZIP_BYTES}`);
  process.exit(1);
} else {
  console.log("PASS: within 15 KB gzip budget");
}
