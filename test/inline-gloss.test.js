import test from 'node:test';
import assert from 'node:assert/strict';
import {vocabularyMarkers} from '../public/vocabulary.js';
import {paragraphSegments,buildReviewData} from '../public/report-data.js';
const passage='Trees help.\n\nTrees cool cities.';
const entry={term:'Trees',context:'Trees cool cities.',contextualMeaning:'树木',generalMeaning:'树',contextTranslation:'树木为城市降温。',passageStart:11,passageEnd:16};
test('gloss targets the selected occurrence and preserves original evidence offsets',()=>{
 const question={id:'q',options:['a','b'],answerIndex:0,evidence:'Trees cool cities.'};
 const report=buildReviewData({passage,questions:[question],answers:{q:0},vocabulary:[entry]});
 const parts=paragraphSegments(passage,report.items,report.vocabulary).flat();
 assert.equal(parts.map(p=>p.text).join(''),passage.replace(/\n\n/g,''));
 assert.equal(parts.find(p=>p.glosses.length).text,'Trees');
 assert.equal(parts.filter(p=>p.glosses.length).length,1);
 assert.equal(passage.slice(report.items[0].range.start,report.items[0].range.end),'Trees cool cities.');
 assert.equal(paragraphSegments(passage,[],[]).flat().flatMap(p=>p.glosses).length,0);
});
test('old records require unambiguous context and do not annotate all repeated words',()=>{
 assert.deepEqual(vocabularyMarkers('Trees help.Trees cool cities.',[{...entry,passageStart:undefined,passageEnd:undefined}]),[{start:11,end:16,meaning:'树木'}]);
 assert.deepEqual(vocabularyMarkers('Trees help.Trees help.',[{...entry,context:'Trees help.',passageStart:undefined}]),[]);
 assert.deepEqual(vocabularyMarkers('Other passage.',[entry]),[]);
});
