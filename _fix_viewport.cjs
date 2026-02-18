const fs = require('fs');

// Fix main.tsx: change height calc and add body.top tracking
let main = fs.readFileSync('src/main.tsx', 'utf8');

// 1. Change vv.height + vv.offsetTop back to vv.height
main = main.replace(
  'Math.round(vv.height + vv.offsetTop)',
  'Math.round(vv.height)'
);

// 2. After setting body height, add body.top = offsetTop
const heightLine = "document.body.style.height = `${h}px`";
const replacement = `document.body.style.height = \`\${h}px\`
      if (vv) {
        document.body.style.top = \`\${Math.round(vv.offsetTop)}px\`
      }`;

if (main.includes(replacement)) {
  console.log('main.tsx: body.top logic already present, skipping');
} else if (main.includes(heightLine)) {
  main = main.replace(heightLine, replacement);
  console.log('main.tsx: added body.top = offsetTop logic');
} else {
  console.log('ERROR: could not find height line in main.tsx');
  process.exit(1);
}

fs.writeFileSync('src/main.tsx', main, 'utf8');
console.log('main.tsx updated');

// Fix index.css: remove top: 0 !important from iOS body rules
let css = fs.readFileSync('src/index.css', 'utf8');

// Split html.ios-pwa, html.ios-pwa body into separate rules
const oldPwa = `html.ios-pwa,
html.ios-pwa body {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: manipulation !important;
  background: #000 !important;
}`;

const newPwa = `html.ios-pwa {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: manipulation !important;
  background: #000 !important;
}
html.ios-pwa body {
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: manipulation !important;
  background: #000 !important;
}`;

if (css.includes(oldPwa)) {
  css = css.replace(oldPwa, newPwa);
  console.log('index.css: split ios-pwa rules, removed top:0!important from body');
} else {
  console.log('WARNING: ios-pwa block not found as expected, trying partial fix');
}

// Remove top: 0 !important from html.ios-safe-area body
const oldSafe = `html.ios-safe-area body {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}`;

const newSafe = `html.ios-safe-area body {
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}`;

if (css.includes(oldSafe)) {
  css = css.replace(oldSafe, newSafe);
  console.log('index.css: removed top:0!important from ios-safe-area body');
} else {
  console.log('WARNING: ios-safe-area body block not found as expected');
}

fs.writeFileSync('src/index.css', css, 'utf8');
console.log('index.css updated');
console.log('All done!');
