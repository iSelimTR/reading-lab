import test from 'node:test';
import assert from 'node:assert/strict';
import * as docx from 'docx';
import { normalizedIndex, buildReviewData, paragraphSegments } from '../public/report-data.js';
import { createReviewDocument } from '../public/export-word.js';

const source = 'Trees reduce summer heat.\n\nCareful mainte-\nnance helps young trees survive.';
const question = {id:'q1',type:'detail',prompt:'What helps young trees survive?',options:['Maintenance','Neglect','Cold','Darkness'],answerIndex:0,explanation:'原文明确指出维护有助于幼树存活，忽视维护不符合原文。',evidence:'Careful maintenance helps young trees survive.'};

test('evidence mapping handles OCR line hyphenation, curly quotes, full width and whitespace',()=>{
 const report=buildReviewData({passage:source,questions:[question],answers:{q1:1}});
 assert.equal(source.slice(report.items[0].range.start,report.items[0].range.end),'Careful mainte-\nnance helps young trees survive.');
 assert.equal(normalizedIndex('  “Ｔrees”\tcan\nhelp. ').text,'"trees" can help.');
 assert.equal(report.correct,0);assert.equal(report.items[0].selected,1);
});

test('overlapping and shared evidence retain original text and all question references',()=>{
 const passage='Trees provide shade. Trees help people.';
 const questions=[{...question,evidence:'Trees provide shade.'},{...question,id:'q2',evidence:'provide shade. Trees help'}];
 const report=buildReviewData({passage,questions,answers:{q1:0}});
 const segments=paragraphSegments(passage,report.items).flat();
 assert.equal(segments.map(part=>part.text).join(''),passage);
 assert.deepEqual(segments.flatMap(part=>part.references).sort(),[1,2]);
 assert.equal(report.items[1].selected,null);
 assert.ok(segments.some(part=>part.highlight));
});

test('unmatched evidence is explicit and does not highlight an unrelated passage',()=>{
 const report=buildReviewData({passage:source,questions:[{...question,evidence:'A fabricated quotation.'}],answers:{q1:0}});
 assert.equal(report.items[0].range,null);
 assert.ok(paragraphSegments(source,report.items).flat().every(part=>!part.highlight));
});

test('Word export creates a real docx package for wrong and missing answers',async()=>{
 const document=createReviewDocument({title:'Reading practice',passage:source,questions:[question,{...question,id:'q2'}],answers:{q1:1},date:'2026-11-17T12:00:00Z'},docx);
 const bytes=await docx.Packer.toBuffer(document);
 assert.equal(bytes.subarray(0,2).toString(),'PK');assert.ok(bytes.length>5000);
});
