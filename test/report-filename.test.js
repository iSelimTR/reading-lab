import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewFilename} from '../public/report-data.js';
test('report filenames use an actual article title or source excerpt and safe Windows characters',()=>{
 const first=reviewFilename({title:'Why Cities Need Trees',passage:'Other text.'});
 assert.match(first,/^Why Cities Need Trees_复盘_\d{8}_\d{6}_\d{3}\.docx$/);
 const fallback=reviewFilename({title:'我的阅读练习',passage:'\nUrban trees reduce summer heat.\n\nMore text.'});
 assert.ok(fallback.startsWith('Urban trees reduce summer heat._复盘_')||fallback.startsWith('Urban trees reduce summer heat_复盘_'));
 const safe=reviewFilename({title:'A/B: C? <Trees> * \"',passage:''});
 assert.ok(!/[<>:"/\\|?*]/.test(safe));
});
test('repeated exports at the exact same instant get distinct filenames',()=>{
 const input={title:'阅读练习',passage:'A study of urban trees.'},date=new Date();
 const names=Array.from({length:25},()=>reviewFilename(input,date));
 assert.equal(new Set(names).size,25);
});
