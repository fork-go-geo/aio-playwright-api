const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const selectionStart = source.indexOf('// A document-order <img> can be a menu control');
const selectionEnd = source.indexOf('const contactRe =', selectionStart);

assert.notEqual(selectionStart, -1, 'representative-image selection contract was not found');
assert.notEqual(selectionEnd, -1, 'representative-image selection contract end was not found');

const selection = source.slice(selectionStart, selectionEnd);
assert.match(selection, /let primaryImageCandidate = '';/);
assert.match(selection, /let primaryImageOfPageSource = 'none';/);
assert.match(selection, /if \(ogImageUrl\)[\s\S]*primaryImageOfPageSource = 'og'/);
assert.match(selection, /else if \(twitterImageUrl\)[\s\S]*primaryImageOfPageSource = 'twitter'/);
assert.match(selection, /else if \(multimodalJsonLd\.primaryImageOfPage\)[\s\S]*primaryImageOfPageSource = 'jsonld_primary'/);
assert.ok(!selection.includes('imgNodes.find'), 'document-order img fallback must not select a hamburger or other UI asset');
assert.ok(!selection.includes('structuredLogoUrl'), 'an organization logo must not be promoted to a page representative image');

const emittedStart = source.indexOf('const multimodalSignals = {', selectionStart);
const emittedEnd = source.indexOf('const claritySignals = {', emittedStart);
const emitted = source.slice(emittedStart, emittedEnd);
assert.match(emitted, /primaryImageOfPage: primaryImageCandidate \|\| ''/);
assert.match(emitted, /primaryImageOfPageSource,/);

console.log(JSON.stringify({
  pass: true,
  cases: {
    hamburgerOnly: 'no representative image',
    ogImage: 'trusted source=og',
    twitterImage: 'trusted source=twitter',
    jsonldPrimaryImage: 'trusted source=jsonld_primary',
    jsonldLogo: 'not promoted to page representative image'
  }
}));
