'use strict';

// Do not silently test OFF when a developer changes switch whitespace.
const assert = require('node:assert/strict');
function withHalloween(source, enabled) {
  const expression = /\bconst\s+HALLOWEEN_ENABLED\s*=\s*(?:true|false)\s*;/g;
  assert.equal([...source.matchAll(expression)].length, 1, 'exactly one Halloween release switch is required');
  return source.replace(expression, `const HALLOWEEN_ENABLED = ${enabled === true};`);
}
module.exports = { withHalloween };
