const fs = require('fs');
let s = fs.readFileSync('src/app/page.tsx', 'utf8');
const before2 = (s.match(/v3\.2/g) || []).length;
s = s.split('v3.2').join('v3.3');
s = s.replace(
  "desc: '研讀用。直向捲動閱讀、可調字級與版寬、底部音檔列。'",
  "desc: '研讀用。直向捲動閱讀、可調字級與版寬、底部音檔列。雙螢幕時控制端可翻頁同步捲動。'"
);
s = s.replace(
  "desc: '投影用。講師背景圖＋毛玻璃字幕框，框寬高可調。'",
  "desc: '投影用。講師背景圖＋長條透明字幕框，框寬高與離底高度可調。'"
);
fs.writeFileSync('src/app/page.tsx', s, 'utf8');
console.log('replaced v3.2:', before2, '| v3.3 now:', (s.match(/v3\.3/g) || []).length, '| v3.2 left:', (s.match(/v3\.2/g) || []).length);
