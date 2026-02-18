const fs = require('fs');

let css = fs.readFileSync('src/index.css', 'utf8');

// Fix 1: html.ios-pwa body - remove inset:0 !important (it blocks JS body.top)
css = css.replace(
  /html\.ios-pwa body \{[^}]*\}/,
  (match) => {
    return match
      .replace('inset: 0 !important;', 'left: 0 !important;\n  right: 0 !important;')
      .replace('height: auto;', '');
  }
);

// Fix 2: html.ios-safe-area body (the one with position: fixed)
// There are two html.ios-safe-area body blocks; we need to fix the one with inset
css = css.replace(
  /html\.ios-safe-area body \{\s*position: fixed !important;\s*inset: 0 !important;\s*height: auto;\s*overflow: hidden !important;\s*overscroll-behavior: none !important;\s*\}/,
  `html.ios-safe-area body {
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}`
);

fs.writeFileSync('src/index.css', css, 'utf8');

// Verify
const result = fs.readFileSync('src/index.css', 'utf8');
const bodyInsetCount = (result.match(/body[^{]*\{[^}]*inset:\s*0\s*!important/g) || []).length;
console.log('body rules still using inset:0 !important:', bodyInsetCount);
if (bodyInsetCount > 0) {
  console.log('WARNING: some body rules still have inset:0 !important');
} else {
  console.log('OK: no body rules have inset:0 !important');
}

// Check html rules still have inset (they should)
const htmlInsetCount = (result.match(/html\.[^{]*\{[^}]*inset:\s*0\s*!important/g) || []).length;
console.log('html rules with inset:0 !important:', htmlInsetCount, '(should be 2)');

console.log('Done!');
