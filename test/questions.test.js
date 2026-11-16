import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_TEXT, generateBasicQuiz, gradeQuiz, normalizeText, validateQuiz } from '../src/questions.js';

test('basic quiz contains unique options, usable evidence and exactly one keyed answer', () => {
  for (let seed = 1; seed <= 20; seed++) {
    let state = seed;
    const random = () => { state = state * 16807 % 2147483647; return state / 2147483647; };
    const quiz = generateBasicQuiz(DEMO_TEXT, 5, random);
    assert.equal(quiz.questions.length, 5);
    for (const question of quiz.questions) {
      assert.equal(new Set(question.options.map(option => option.toLowerCase())).size, 4);
      assert.ok(normalizeText(DEMO_TEXT).includes(question.evidence));
      assert.equal(question.prompt.split('________').length, 2);
      assert.ok(question.evidence.includes(question.options[question.answerIndex]));
    }
  }
});

test('repeated source sentences do not become duplicate questions', () => {
  const quiz = generateBasicQuiz(`${DEMO_TEXT}\n${DEMO_TEXT}`, 15);
  const evidence = quiz.questions.map(question => question.evidence);
  assert.equal(new Set(evidence).size, evidence.length);
});

test('PDF headings and publisher notes are excluded from question evidence', () => {
  const text = `Academic Reading Sample Task — Note Completion\n\n[Note: This is an extract from a text about science.]\n\nAdapted with permission from a publisher, copyright 2020.\n\n${DEMO_TEXT}`;
  const quiz = generateBasicQuiz(text, 15);
  for (const question of quiz.questions) assert.doesNotMatch(question.evidence, /copyright|sample task|publisher|\[note/i);
});

test('rejects unsupported count and insufficient text instead of inventing questions', () => {
  assert.throws(() => generateBasicQuiz('Too short.', 5), /太短/);
  assert.throws(() => generateBasicQuiz(DEMO_TEXT, 100), /3–15/);
  assert.throws(() => generateBasicQuiz('abcdefghijklmnop '.repeat(30), 5), /完整英文句子/);
});

test('grading counts wrong, missing and out-of-range selections correctly', () => {
  const { questions } = generateBasicQuiz(DEMO_TEXT, 5);
  const answers = {
    [questions[0].id]: questions[0].answerIndex,
    [questions[1].id]: (questions[1].answerIndex + 1) % 4,
    [questions[2].id]: -1,
    [questions[3].id]: questions[3].answerIndex
  };
  const result = gradeQuiz(questions, answers);
  assert.equal(result.correct, 2);
  assert.equal(result.total, 5);
  assert.equal(result.percent, 40);
  assert.equal(result.results[2].selected, null);
  assert.equal(result.results[4].selected, null);
});

test('AI output is rejected for fabricated evidence, duplicate choices or invalid answer index', () => {
  const quiz = generateBasicQuiz(DEMO_TEXT, 3);
  assert.equal(validateQuiz(quiz, DEMO_TEXT, 3).mode, 'ai');
  const fabricated = structuredClone(quiz);
  fabricated.questions[0].evidence = 'This invented information does not appear in the passage.';
  assert.throws(() => validateQuiz(fabricated, DEMO_TEXT, 3), /依据/);
  const duplicate = structuredClone(quiz);
  duplicate.questions[0].options[1] = duplicate.questions[0].options[0].toUpperCase();
  assert.throws(() => validateQuiz(duplicate, DEMO_TEXT, 3), /格式/);
  const wrongIndex = structuredClone(quiz);
  wrongIndex.questions[0].answerIndex = 4;
  assert.throws(() => validateQuiz(wrongIndex, DEMO_TEXT, 3), /格式/);
});
