import { generateBasicQuiz, gradeQuiz, DEMO_TEXT } from './src/questions.js';
import { openPDF, extractPDF } from './pdf.js';

const $ = id => document.getElementById(id);
const LETTERS = ['A', 'B', 'C', 'D'];
let pdf = null;
let busy = false;
let allQuestions = [];
let questions = [];
let answers = {};
let submitted = false;
let currentQuiz = null;
let attemptStarted = null;
let generationPassage = '';

function tell(message = '', error = false) {
  $('message').hidden = !message;
  $('message').textContent = message;
  $('message').classList.toggle('error', error);
}

function setBusy(value, message = '') {
  busy = value;
  for (const id of ['demo', 'file', 'extract', 'generate', 'passage', 'startPage', 'endPage', 'forceOcr', 'ocrLanguage', 'mode', 'questionCount']) $(id).disabled = value;
  $('difficulty').disabled = value || $('mode').value !== 'ai';
  if (message) tell(message);
}

function countWords() {
  const matches = $('passage').value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
  $('wordCount').textContent = `${matches?.length || 0} words`;
}

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

async function choosePDF(file) {
  if (!file || busy) return;
  const previous = pdf;
  setBusy(true, '正在打开 PDF…');
  try {
    const loaded = await openPDF(file);
    pdf = loaded;
    if (previous) await previous.destroy();
    $('fileName').textContent = file.name;
    $('pdfControls').hidden = false;
    $('startPage').value = 1;
    $('endPage').value = Math.min(3, pdf.numPages);
    $('startPage').max = $('endPage').max = pdf.numPages;
    $('passage').value = '';
    countWords();
    $('pdfHint').textContent = `共 ${pdf.numPages} 页。选择正文所在页，每次最多 20 页。`;
    tell('PDF 已就绪，选择页码后点击“识别所选页面”。');
  } catch (error) {
    const message = error.name === 'PasswordException' ? 'PDF 带有密码，请先解锁文件后重新上传。' : error.message;
    tell(message || 'PDF 打开失败，请更换文件。', true);
    $('file').value = '';
  } finally { setBusy(false); }
}

$('file').addEventListener('change', event => choosePDF(event.target.files[0]));
for (const type of ['dragenter', 'dragover']) $('dropzone').addEventListener(type, event => { event.preventDefault(); $('dropzone').classList.add('dragover'); });
for (const type of ['dragleave', 'drop']) $('dropzone').addEventListener(type, event => { event.preventDefault(); $('dropzone').classList.remove('dragover'); });
$('dropzone').addEventListener('drop', event => choosePDF(event.dataTransfer.files[0]));
$('passage').addEventListener('input', countWords);
$('mode').addEventListener('change', () => {
  $('difficulty').disabled = $('mode').value !== 'ai';
  $('modeHelp').textContent = $('mode').value === 'ai' ? 'AI 会生成细节、同义替换、推断和主旨选择题，附中文解析与原文依据。' : '基础模式免费使用，根据文章自动生成原文填空题。';
});

$('demo').addEventListener('click', () => {
  $('passage').value = DEMO_TEXT;
  countWords();
  tell('已载入原创示例。点击“生成我的练习”即可开始。');
});

$('extract').addEventListener('click', async () => {
  if (busy || !pdf) return;
  setBusy(true);
  try {
    const result = await extractPDF(pdf, {
      start: Number($('startPage').value), end: Number($('endPage').value),
      forceOCR: $('forceOcr').checked, language: $('ocrLanguage').value, onProgress: tell
    });
    $('passage').value = result.text;
    countWords();
    tell(`已读取 ${result.pageCount} 页，其中 ${result.ocrPages} 页使用 OCR。请检查正文后生成练习。`);
  } catch (error) { tell(error.message || '文字识别失败，请检查网络和文件后重试。', true); }
  finally { setBusy(false); }
});

$('generate').addEventListener('click', async () => {
  if (busy) return;
  const text = $('passage').value.trim();
  if (text.length < 150) return tell('先上传 PDF 或粘贴一段完整的英文文章。', true);
  if (text.length > 30_000) return tell('正文超过 30000 字符，请减少页数或只保留一篇文章。', true);
  const count = Number($('questionCount').value);
  setBusy(true, '正在为这篇文章生成练习…');
  try {
    let quiz;
    if ($('mode').value === 'ai') {
      const response = await fetch('./api/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, count, difficulty: $('difficulty').value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI 生成失败，请重试。');
      quiz = data;
    } else { quiz = generateBasicQuiz(text, count); }
    currentQuiz = quiz;
    allQuestions = quiz.questions;
    generationPassage = text;
    $('quizTitle').textContent = quiz.title;
    $('quizMode').textContent = quiz.mode === 'ai' ? 'AI READING · 理解与推断' : 'BASIC READING · 原文填空选择题';
    $('readingText').replaceChildren(...text.split(/\n\s*\n/).filter(Boolean).map(paragraph => element('p', '', paragraph)));
    $('setup').hidden = true;
    $('practice').hidden = false;
    startAttempt(allQuestions);
    tell(quiz.questions.length < count ? `这段文章适合生成 ${quiz.questions.length} 道题，已按实际可用句子出题。` : '练习已生成。先独立作答，提交后查看解析。');
    $('practice').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { tell(error.message || '生成失败，请稍后重试。', true); }
  finally { setBusy(false); }
});

function updateProgress() {
  $('progress').textContent = `已答 ${Object.keys(answers).length} / ${questions.length}`;
}

function startAttempt(nextQuestions) {
  questions = [...nextQuestions];
  answers = {};
  submitted = false;
  attemptStarted = Date.now();
  $('score').hidden = true;
  $('reviewActions').hidden = true;
  $('submit').hidden = false;
  $('submitHint').textContent = '选好答案后，提交查看解析。';
  $('step1').classList.remove('active');
  $('step2').classList.add('active');
  $('step3').classList.remove('active');
  renderQuestions();
  updateProgress();
}

function renderQuestions() {
  $('questions').replaceChildren();
  questions.forEach((question, index) => {
    const fieldset = element('fieldset', 'question-card');
    fieldset.dataset.question = question.id;
    const legend = element('legend');
    const meta = element('span', 'question-meta');
    meta.append(element('span', 'question-number', `${String(index + 1).padStart(2, '0')} / ${String(questions.length).padStart(2, '0')}`), element('span', '', question.type));
    legend.append(meta, element('span', 'question-prompt', question.prompt));
    fieldset.append(legend);
    question.options.forEach((option, optionIndex) => {
      const label = element('label', 'option');
      const input = document.createElement('input');
      input.type = 'radio'; input.name = question.id; input.value = optionIndex;
      input.checked = answers[question.id] === optionIndex;
      input.disabled = submitted;
      input.addEventListener('change', () => { answers[question.id] = optionIndex; updateProgress(); });
      label.append(input, element('span', 'option-letter', LETTERS[optionIndex]), element('span', '', option));
      if (submitted && optionIndex === question.answerIndex) label.classList.add('correct-option');
      if (submitted && answers[question.id] === optionIndex && optionIndex !== question.answerIndex) label.classList.add('wrong-option');
      fieldset.append(label);
    });
    if (submitted) {
      const correct = answers[question.id] === question.answerIndex;
      const review = element('div', 'answer-review');
      review.append(element('p', `answer-verdict${correct ? '' : ' wrong'}`, correct ? '✓ 回答正确' : `${answers[question.id] === undefined ? '未作答' : '回答有误'} · 正确答案 ${LETTERS[question.answerIndex]}`),
        element('p', '', question.explanation), element('p', 'help', '原文依据'), element('blockquote', 'evidence', question.evidence));
      fieldset.append(review);
    }
    $('questions').append(fieldset);
  });
}

$('quizForm').addEventListener('submit', event => {
  event.preventDefault();
  if (submitted || !questions.length) return;
  const missing = questions.filter(question => answers[question.id] === undefined);
  if (missing.length) {
    tell(`还有 ${missing.length} 道题没有选择。先完成后再提交。`, true);
    document.querySelector(`[data-question="${missing[0].id}"] input`)?.focus();
    return;
  }
  submitted = true;
  const result = gradeQuiz(questions, answers);
  renderQuestions();
  $('score').replaceChildren();
  const value = element('div', 'score-value', String(result.correct));
  value.append(element('small', '', ` / ${result.total}`));
  const copy = element('div', 'score-copy');
  copy.append(element('strong', '', result.correct === result.total ? '这一轮全部答对了。' : '完成一轮，读懂更多。'),
    element('p', '', `正确率 ${result.percent}% · 用时 ${Math.max(1, Math.round((Date.now() - attemptStarted) / 60_000))} 分钟。下面查看解析和原文依据。`));
  $('score').append(value, copy);
  $('score').hidden = false;
  $('submit').hidden = true;
  $('submitHint').textContent = '绿色标记正确选项，红色标记本次选错的答案。';
  $('reviewActions').hidden = false;
  $('retryWrong').disabled = result.correct === result.total;
  $('step2').classList.remove('active');
  $('step3').classList.add('active');
  tell();
  $('score').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('retryWrong').addEventListener('click', () => {
  const wrong = questions.filter(question => answers[question.id] !== question.answerIndex);
  if (!wrong.length) return;
  startAttempt(wrong);
  tell('已载入本轮错题。独立重做后再核对依据。');
  $('practice').scrollIntoView({ behavior: 'smooth' });
});
$('retryAll').addEventListener('click', () => { startAttempt(allQuestions); tell('已重置本篇的全部题目。'); $('practice').scrollIntoView({ behavior: 'smooth' }); });
$('edit').addEventListener('click', () => {
  $('setup').hidden = false; $('practice').hidden = true;
  $('step1').classList.add('active'); $('step2').classList.remove('active'); $('step3').classList.remove('active');
  tell(); $('setup').scrollIntoView({ behavior: 'smooth' });
});
$('export').addEventListener('click', () => {
  const payload = { version: 1, date: new Date().toISOString(), title: currentQuiz.title, mode: currentQuiz.mode,
    passage: generationPassage, questions, answers, result: gradeQuiz(questions, answers) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `reading-lab-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

try {
  const response = await fetch('./api/config', { headers: { Accept: 'application/json' } });
  if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
    const config = await response.json();
    if (config.aiEnabled) {
      $('mode').options[1].disabled = false;
      $('mode').options[1].textContent = 'AI 理解题 · 细节 / 推断 / 主旨';
    }
  }
} catch { /* Static GitHub Pages uses the browser-local basic mode. */ }
