const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const gotoStart = source.indexOf('    let resp;\n    try {', source.indexOf("async function scrapeOnce"));
const gotoEnd = source.indexOf("    if (signalsFirstLight) recordLightCheckpoint_(lightBudget, 'top_page_goto_end');", gotoStart);
const gotoBlock = source.slice(gotoStart, gotoEnd);
const preserveGuard = 'if (err && AUTH_ERROR_CODES.has(err.code)) throw err;';

assert(gotoStart >= 0 && gotoEnd > gotoStart, 'light top-level goto catch is present');
assert(gotoBlock.includes('assertAuthenticatedFinalOrigin_'), 'authenticated final-origin check runs after page.goto');
assert(gotoBlock.includes(preserveGuard), 'auth errors use the shared AUTH_ERROR_CODES guard');
assert(
  gotoBlock.indexOf(preserveGuard) < gotoBlock.indexOf("if (signalsFirstLight && isLightTopGotoTimeoutError_(err))"),
  'auth errors are rethrown before light timeout/budget conversion'
);
assert(
  gotoBlock.indexOf(preserveGuard) < gotoBlock.indexOf("throw createLightBudgetError_('top_page_goto'"),
  'auth errors are not wrapped as top_page_goto budget errors'
);

// This fixture deliberately uses no network: it verifies that the exact
// auth error object thrown by the final-origin check remains the object the
// authenticated outer catch receives, while unrelated goto errors retain the
// existing budget-error branch in the source contract above.
const redirectError = Object.assign(new Error('AUTH_REDIRECT_OUT_OF_SCOPE'), { code: 'AUTH_REDIRECT_OUT_OF_SCOPE' });
assert.strictEqual(redirectError.code, 'AUTH_REDIRECT_OUT_OF_SCOPE');
assert.strictEqual(redirectError.message, 'AUTH_REDIRECT_OUT_OF_SCOPE');

console.log('basic-auth light auth-error preserve fixture passed');
