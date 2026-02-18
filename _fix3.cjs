const fs = require('fs');
let d = fs.readFileSync('src/main.tsx', 'utf8');

// 1. Revert vvHeight-only back to vv.height + vv.offsetTop, remove scrollTo(0,0), add min-height guard
const oldBlock = [
  '      const layoutHeight = Math.round(window.innerHeight || 0)',
  '      // \u5bf9 fixed \u5b9a\u4f4d\u5bb9\u5668\uff0c\u53ea\u7528 vv.height\uff08\u4e0d\u52a0 offsetTop\uff09\uff0c\u56e0\u4e3a fixed \u4e0d\u53d7\u6587\u6863\u6eda\u52a8\u5f71\u54cd\u3002',
  '      const vvHeight = vv ? Math.round(vv.height) : layoutHeight',
  '      const nextHeight = Math.min(layoutHeight, vvHeight) || layoutHeight',
  '',
  '      // iOS \u952e\u76d8\u5f39\u51fa\u65f6\u4f1a\u5077\u5077\u7ed9\u9875\u9762\u52a0\u4e00\u4e2a offsetTop \u6eda\u52a8\u91cf\uff0c',
  '      // \u5bfc\u81f4 fixed \u5bb9\u5668\u5e95\u90e8\u9732\u51fa\u58c1\u7eb8\u3002\u5f3a\u5236\u91cd\u7f6e\u4e3a 0 \u6765\u6d88\u9664\u8fd9\u4e2a iOS \u884c\u4e3a\u3002',
  '      if (isIOS && vv && vv.offsetTop > 0) {',
  '        window.scrollTo(0, 0)',
  '      }',
].join('\n');

const newBlock = [
  '      const layoutHeight = Math.round(window.innerHeight || 0)',
  '      // vv.height + vv.offsetTop = \u53ef\u89c6\u533a\u57df\u5e95\u8fb9\uff08\u542b iOS \u504f\u79fb\uff09',
  '      const viewportBottom = vv ? Math.round(vv.height + vv.offsetTop) : layoutHeight',
  '      let nextHeight = Math.min(layoutHeight, viewportBottom) || layoutHeight',
  '      // \u9632\u5854\u7f29\u4fdd\u62a4\uff1a--app-height \u6c38\u8fdc\u4e0d\u4f4e\u4e8e\u5c4f\u5e55\u9ad8\u5ea6\u768440%\uff0c\u907f\u514d\u952e\u76d8\u52a8\u753b\u671f\u95f4\u77ac\u65f6\u5f02\u5e38\u503c\u5bfc\u81f4\u6574\u4e2a\u804a\u5929\u80cc\u666f\u53d8\u58c1\u7eb8',
  '      const minHeight = Math.round(layoutHeight * 0.38)',
  '      if (nextHeight < minHeight) nextHeight = lastH > minHeight ? lastH : minHeight',
].join('\n');

// 2. Fix keyboardHeight calc
const oldKb = '      const keyboardHeight = Math.max(0, layoutHeight - vvHeight)';
const newKb = '      const keyboardHeight = Math.max(0, layoutHeight - viewportBottom)';

d = d.replace(oldBlock, newBlock);
d = d.replace(oldKb, newKb);

// Verify replacements
if (!d.includes('viewportBottom') || d.includes('scrollTo(0, 0)')) {
  console.log('ERROR: replacement failed');
  process.exit(1);
}

fs.writeFileSync('src/main.tsx', d, 'utf8');
console.log('Done. Fixed main.tsx - reverted scrollTo, added min-height guard');
