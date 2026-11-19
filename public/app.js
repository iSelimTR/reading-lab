import {originalImportUI} from './original-ui.js';
import {evaluateAnswer,gradeReading,answerLabel,answerSourceLabel,questionKind} from './original-quiz.js';
import {readSession,writeSession} from './session.js';
import { generateBasicQuiz, gradeQuiz, DEMO_TEXT } from './src/questions.js';
import { openPDF, extractPDF } from './pdf.js';
import { selectionContext, vocabularyIdentity, vocabularyMarkers } from './vocabulary.js';
import {floatingPosition} from './floating-position.js';

const $ = id => document.getElementById(id);
const LETTERS = ['A', 'B', 'C', 'D'];
let pdf = null;
let busy = false;
let allQuestions = [];
let questions = [];
let answers = {};
let submitted = false;
let currentQuiz = null;
let exportDownloadURL = null;
let attemptStarted = null;
let attemptFinished = null;
let persistenceReady = false;
let saveQueued = false;
let generationPassage = '';
let annotations = [];
let vocabulary = [];
let translationResult = null;
let translationAnchor = null;
let translationFrame = null;
let translationBusy = false;
let translationVersion = 0;
const translationCache = new Map();
let pendingSelection = null;
let annotationSequence = 0;
let backendAvailable = false;
let serverDeepSeekKey = false;

function selectedModel() { return document.querySelector('input[name="deepseekModel"]:checked').value; }
function updateAISettings() {
  const ownKey = Boolean($('deepseekKey').value.trim());
  $('mode').options[1].disabled = !backendAvailable;
  $('parseOriginal').disabled = busy || !backendAvailable;
  $('deepseekKey').disabled = busy || !backendAvailable;
  $('clearKey').disabled = busy || !ownKey || !backendAvailable;
  for (const radio of document.querySelectorAll('input[name="deepseekModel"]')) radio.disabled = busy || !backendAvailable;
  $('modelSummary').textContent = selectedModel() === 'deepseek-flash' ? 'Flash' : 'V4 Pro';
  $('connectionStatus').textContent = !backendAvailable ? '当前是静态网页。AI 设置需通过本地启动文件或 Node 服务使用。' : 'DeepSeek 官方接口 · 按使用量计费';
  $('keySource').textContent = !backendAvailable ? '尚未连接出题服务' : ownKey ? '使用当前页面输入的密钥' : serverDeepSeekKey ? '使用本地已配置密钥' : '请在上方填写完整密钥';
}
$('deepseekKey').addEventListener('input', updateAISettings);
$('clearKey').addEventListener('click', () => { $('deepseekKey').value = ''; updateAISettings(); });
for (const radio of document.querySelectorAll('input[name="deepseekModel"]')) radio.addEventListener('change', updateAISettings);
window.addEventListener('pageshow', event => { if (event.persisted) { $('deepseekKey').value = ''; updateAISettings(); } });

function tell(message = '', error = false) {
  $('message').hidden = !message;
  $('message').textContent = message;
  $('message').classList.toggle('error', error);
  queueSave();
}

function setBusy(value, message = '') {
  busy = value;
  for (const id of ['demo', 'file', 'extract', 'generate', 'passage', 'startPage', 'endPage', 'forceOcr', 'ocrLanguage', 'mode', 'questionCount', 'parseOriginal', 'startOriginal', 'pdfTextTarget', 'originalQuestionText', 'originalAnswerText']) $(id).disabled = value;
  $('difficulty').disabled = value || $('mode').value !== 'ai';
  updateAISettings();
  updateOriginalMode();
  if (message) tell(message);
}

function countWords() {
  queueSave();
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
    $('previewPDF').hidden=false;$('previewPage').max=pdf.numPages;$('previewPage').value=1;
    if($('previewPDF').open)originalUI.showPage();
    if (previous) await previous.destroy();
    $('fileName').textContent = file.name;
    $('pdfControls').hidden = false;
    $('startPage').value = 1;
    $('endPage').value = Math.min(3, pdf.numPages);
    $('startPage').max = $('endPage').max = pdf.numPages;
    // Keep extracted text when uploading a separate question or answer PDF.
    countWords();
    $('pdfTextTarget').value='combined';
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
  if ($('mode').value !== 'basic') $('deepseekSettings').open = true;
  updateOriginalMode();
  $('difficulty').disabled = $('mode').value !== 'ai';
  $('modeHelp').textContent = $('mode').value === 'original' ? '保留 PDF 自带的题目。识别使用 DeepSeek，先核对再开始；缺少答案可选择 AI 参考答案。' : $('mode').value === 'ai' ? 'AI 会生成细节、同义替换、推断和主旨选择题，附中文解析与原文依据。' : '基础模式免费使用，根据文章自动生成原文填空题。';
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
      forceOCR: $('forceOcr').checked, language: $('ocrLanguage').value, minTextLength:$('pdfTextTarget').value==='answers'?6:40, onProgress: tell
    });
    const target=$('pdfTextTarget').value;
    if(target==='questions')$('originalQuestionText').value=result.text;
    else if(target==='answers')$('originalAnswerText').value=result.text;
    else $('passage').value = result.text;
    queueSave();
    countWords();
    tell(`已读取 ${result.pageCount} 页，其中 ${result.ocrPages} 页使用 OCR。原题模式请同时包含文章和题目页；答案页可单独读取，再点击“识别原文与原题”。`);
  } catch (error) { tell(error.message || '文字识别失败，请检查网络和文件后重试。', true); }
  finally { setBusy(false); }
});

$('generate').addEventListener('click', async () => {
  if (busy) return;
  const text = $('passage').value.trim();
  if (text.length < 150) return tell('先上传 PDF 或粘贴一段完整的英文文章。', true);
  if (text.length > 30_000) return tell('正文超过 30000 字符，请减少页数或只保留一篇文章。', true);
  if ($('mode').value === 'ai' && (!backendAvailable || (!serverDeepSeekKey && !$('deepseekKey').value.trim()))) {
    $('deepseekSettings').open = true;
    $('deepseekKey').focus();
    return tell('请先在 DeepSeek 设置中填写完整 API Key。', true);
  }
  const count = Number($('questionCount').value);
  setBusy(true, '正在为这篇文章生成练习…');
  try {
    let quiz;
    if ($('mode').value === 'ai') {
      const response = await fetch('./api/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, count, difficulty: $('difficulty').value, deepseek: { model: selectedModel(), key: $('deepseekKey').value.trim() } }) });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('AI 需要本地出题服务，请通过 start-local.cmd 启动后访问。');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI 生成失败，请重试。');
      quiz = data;
    } else { quiz = generateBasicQuiz(text, count); }
    activateQuiz(quiz,text);
  } catch (error) { tell(error.message || '生成失败，请稍后重试。', true); }
  finally { setBusy(false); }
});

function activateQuiz(quiz,text) {
    currentQuiz = quiz;
    allQuestions = quiz.questions;
    generationPassage = text;
    $('quizTitle').textContent = quiz.title;
    $('quizMode').textContent = quiz.mode === 'original' ? 'PDF 原题 · 已核对的原文题目' : quiz.mode === 'ai' ? 'DEEPSEEK · ' + (quiz.model === 'deepseek-v4-pro' ? 'V4 PRO' : 'FLASH') + ' · 理解与推断' : 'BASIC READING · 原文填空选择题';
    annotations = [];
    vocabulary = [];
    translationResult = null;
    translationVersion++;
    translationBusy = false;
    $('translationPanel').hidden = true;
    renderVocabulary();
    pendingSelection = null;
    renderPassage();
    renderAnnotationControls();
    $('setup').hidden = true;
    $('practice').hidden = false;
    startAttempt(allQuestions);
    tell(quiz.mode!=='original' && quiz.questions.length < Number($('questionCount').value) ? `这段文章适合生成 ${quiz.questions.length} 道题，已按实际可用句子出题。` : '练习已生成。先独立作答，提交后查看解析。');
    $('practice').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateProgress() {
  queueSave();
  $('progress').textContent = `已答 ${questions.filter(q=>evaluateAnswer(q,answers[q.id]).answered).length} / ${questions.length}`;
}

function startAttempt(nextQuestions) {
  questions = [...nextQuestions];
  answers = {};
  submitted = false;
  attemptStarted = Date.now();
  attemptFinished = null;
  $('score').hidden = true;
  $('reviewActions').hidden = true;
  if(exportDownloadURL){URL.revokeObjectURL(exportDownloadURL);exportDownloadURL=null;}
  $('exportStatus').hidden = true;
  $('exportDownloadLink').hidden = true;
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
  questions.forEach((question,index)=>{
    const result=evaluateAnswer(question,answers[question.id]),fieldset=element('fieldset','question-card');fieldset.dataset.question=question.id;
    const legend=element('legend'),meta=element('span','question-meta');
    meta.append(element('span','question-number',String(index+1).padStart(2,'0')+' / '+String(questions.length).padStart(2,'0')),element('span','',question.type+(question.originalNumber?' · 原题 '+question.originalNumber:'')));
    legend.append(meta,element('span','question-prompt',question.prompt));fieldset.append(legend);
    if(question.instructions)fieldset.append(element('p','help',question.instructions));
    if(question.answerSource)fieldset.append(element('p','answer-source',answerSourceLabel(question)+(question.answerSource==='ai'?' · 请结合原文核对':'')));
    if(questionKind(question)==='fill') {
      const label=element('label','fill-answer','填写答案'+(question.maxWords?'（最多 '+question.maxWords+' 词）':''));
      const input=element('input');input.type='text';input.maxLength=200;input.autocomplete='off';input.spellcheck=false;input.value=typeof answers[question.id]==='string'?answers[question.id]:'';input.disabled=submitted;
      input.setAttribute('aria-label','原题 '+(question.originalNumber||index+1)+' 填空答案');
      input.addEventListener('input',()=>{answers[question.id]=input.value;updateProgress();});
      if(submitted&&result.correct!==null)input.className=result.correct?'correct-fill':'wrong-fill';label.append(input);fieldset.append(label);
    } else question.options.forEach((option,optionIndex)=>{
      const label=element('label','option'),input=element('input');input.type='radio';input.name=question.id;input.value=optionIndex;input.checked=answers[question.id]===optionIndex;input.disabled=submitted;
      input.addEventListener('change',()=>{answers[question.id]=optionIndex;updateProgress();});
      label.append(input,element('span','option-letter',questionKind(question)==='tfng'?'':String.fromCharCode(65+optionIndex)),element('span','',option));
      if(submitted&&result.hasAnswer&&optionIndex===question.answerIndex)label.classList.add('correct-option');
      if(submitted&&result.hasAnswer&&answers[question.id]===optionIndex&&optionIndex!==question.answerIndex)label.classList.add('wrong-option');fieldset.append(label);
    });
    if(submitted){
      const review=element('div','answer-review');
      const verdict=result.correct===null?'未提供答案 · 本题暂不计分':result.correct?'✓ 回答正确':(result.answered?'回答有误':'未作答')+' · 正确答案 '+answerLabel(question);
      review.append(element('p','answer-verdict'+(result.correct===false?' wrong':''),verdict));
      if(result.limitExceeded)review.append(element('p','wrong','超过原题字数限制，最多 '+question.maxWords+' 词。'));
      review.append(element('p','',question.explanation||'请对照原文核对。'),element('p','help','原文依据'),element('blockquote','evidence',question.evidence||'没有可直接定位的关键句，请结合原文核对。'));
      if(question.answerEvidence)review.append(element('p','help','答案页依据：'+question.answerEvidence));fieldset.append(review);
    }
    $('questions').append(fieldset);
  });
}
$('quizForm').addEventListener('submit', event => {
  event.preventDefault();
  if (submitted || !questions.length) return;
  const missing = questions.filter(question => !evaluateAnswer(question,answers[question.id]).answered);
  if (missing.length) {
    tell(`还有 ${missing.length} 道题没有作答。先完成后再提交。`, true);
    document.querySelector(`[data-question="${missing[0].id}"] input`)?.focus();
    return;
  }
  submitted = true;
  attemptFinished = Date.now();
  renderSubmittedResult();
  tell();
  $('score').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function renderSubmittedResult() {
  const result = gradeReading(questions, answers);
  renderQuestions();
  $('score').replaceChildren();
  const value = element('div', 'score-value', String(result.correct));
  value.append(element('small', '', ` / ${result.gradedTotal}`));
  const copy = element('div', 'score-copy');
  copy.append(element('strong', '', result.correct === result.gradedTotal && result.pending===0 ? '这一轮全部答对了。' : '完成一轮，读懂更多。'),
    element('p', '', `正确率 ${result.percent}%${result.pending ? ` · ${result.pending} 题无答案，暂不计分` : ''} · 用时 ${Math.max(1, Math.round(((attemptFinished || Date.now()) - attemptStarted) / 60_000))} 分钟。下面查看解析和原文依据。`));
  $('score').append(value, copy);
  $('score').hidden = false;
  $('submit').hidden = true;
  $('submitHint').textContent = '绿色标记正确选项，红色标记本次选错的答案。';
  $('reviewActions').hidden = false;
  $('retryWrong').disabled = !result.results.some(item=>item.correct===false);
  $('step2').classList.remove('active');
  $('step3').classList.add('active');
}

$('retryWrong').addEventListener('click', () => {
  const wrong = questions.filter(question => evaluateAnswer(question,answers[question.id]).correct===false);
  if (!wrong.length) return;
  startAttempt(wrong);
  tell('已载入本轮错题。独立重做后再核对依据。');
  $('practice').scrollIntoView({ behavior: 'smooth' });
});
$('retryAll').addEventListener('click', () => { startAttempt(allQuestions); tell('已重置本篇的全部题目。'); $('practice').scrollIntoView({ behavior: 'smooth' }); });
$('edit').addEventListener('click', () => {
  $('translationPanel').hidden = true;
  $('setup').hidden = false; $('practice').hidden = true;
  $('step1').classList.add('active'); $('step2').classList.remove('active'); $('step3').classList.remove('active');
  tell(); $('setup').scrollIntoView({ behavior: 'smooth' });
});
$('export').addEventListener('click', async () => {
  if (!submitted || !currentQuiz) return;
  $('export').disabled = true;
  $('export').textContent = '正在生成 Word…';
  $('exportStatus').hidden = false;
  $('exportStatus').textContent = '正在准备 Word 文件，请稍候…';
  $('exportStatus').classList.remove('error');
  $('exportDownloadLink').hidden = true;
  try {
    const { downloadReviewWord } = await import('./export-word.js?version=2');
    const download = await downloadReviewWord({title:currentQuiz.title, passage:generationPassage, questions:[...questions], answers:{...answers}, annotations:annotations.map(note=>({...note})), vocabulary:vocabulary.map(entry=>({...entry}))});
    if(exportDownloadURL) URL.revokeObjectURL(exportDownloadURL);
    exportDownloadURL = download.url;
    $('exportDownloadLink').href = download.url;
    $('exportDownloadLink').download = download.filename;
    $('exportDownloadLink').hidden = false;
    $('exportStatus').textContent = 'Word 已准备好。如果没有自动下载，请点击下面的保存链接。';
    tell('Word 复盘已生成。下载按钮旁可再次点击保存文件。');
  } catch {
    $('exportStatus').classList.add('error');
    $('exportStatus').textContent = 'Word 文件准备失败。请先重启阅读控制台中的服务；若仍失败，先保留本页，不要重新做题。';
    tell('Word 导出失败，请查看下载按钮旁的提示。',true);
  }
  finally { $('export').disabled = false; $('export').textContent = '下载 Word 复盘 ↓'; }
});

try {
  const response = await fetch('./api/config', { headers: { Accept: 'application/json' } });
  if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
    const config = await response.json();
    backendAvailable = Boolean(config.deepseekAvailable);
    serverDeepSeekKey = Boolean(config.deepseekConfigured);
    const defaultRadio = [...document.querySelectorAll('input[name="deepseekModel"]')].find(radio => radio.value === config.deepseekModel);
    if (defaultRadio) defaultRadio.checked = true;
  }
} catch { /* Static GitHub Pages uses the browser-local basic mode. */ }

$('deepseekKey').value = '';
updateAISettings();


// Annotation offsets refer to readingText.textContent, excluding decorative question badges.
function renderPassage() {
  queueSave();
  let offset = 0;
  const markers = vocabularyMarkers(generationPassage.split(/\n\s*\n/).filter(Boolean).join(''),vocabulary);
  const paragraphs = generationPassage.split(/\n\s*\n/).filter(Boolean).map(text => {
    const paragraph = element('p');
    const start = offset, end = start + text.length;
    const relevant = annotations.filter(note => note.start < end && note.end > start);
    const boundaries = [...new Set([start, end, ...markers.filter(marker=>marker.end>start&&marker.end<=end).map(marker=>marker.end), ...relevant.flatMap(note => [Math.max(start, note.start), Math.min(end, note.end)])])].sort((a,b) => a-b);
    for (let index = 0; index < boundaries.length - 1; index++) {
      const from = boundaries[index], to = boundaries[index+1];
      const active = relevant.filter(note => note.start < to && note.end > from);
      const fragment = text.slice(from-start,to-start);
      if (!active.length) paragraph.append(document.createTextNode(fragment));
      else {
        const span = element('span', active.some(note => note.type === 'question') ? 'user-question' : 'user-highlight', fragment);
        if (active.some(note => note.type === 'highlight')) span.classList.add('user-highlight');
        span.title = active.some(note => note.type === 'question') ? '这里有疑问，可在下方“我的标注”中移除' : '我的高亮';
        paragraph.append(span);
      }
      for(const marker of markers.filter(marker=>marker.end===to)) {
        const gloss=element('span','inline-gloss');
        gloss.dataset.gloss='（'+marker.meaning+'）';
        gloss.setAttribute('aria-label',gloss.dataset.gloss);
        paragraph.append(gloss);
      }
    }
    offset = end;
    return paragraph;
  });
  $('readingText').replaceChildren(...paragraphs);
}

function renderAnnotationControls() {
  $('highlightSelection').disabled = $('questionSelection').disabled = !pendingSelection || pendingSelection.source === 'option';
  $('translateSelection').disabled = !pendingSelection || translationBusy;
  $('undoAnnotation').disabled = $('clearAnnotations').disabled = !annotations.length;
  $('selectionHint').textContent = pendingSelection ? '已选中：' + pendingSelection.text.slice(0,75) + (pendingSelection.text.length > 75 ? '…' : '') : '选中原文可高亮、标问号或翻译；选中选项文字也可翻译。';
  $('annotationNotes').hidden = !annotations.length;
  $('annotationCount').textContent = annotations.length;
  const plainText = $('readingText').textContent;
  $('annotationList').replaceChildren(...annotations.map(note => {
    const item = element('li');
    const excerpt = plainText.slice(note.start,note.end);
    const content = element('span','', (note.type === 'question' ? '？ ' : '▰ ') + excerpt.slice(0,110) + (excerpt.length > 110 ? '…' : ''));
    const remove = element('button','text-button','移除');
    remove.type = 'button';
    remove.setAttribute('aria-label','移除标注：' + excerpt.slice(0,35));
    remove.addEventListener('click', () => {
      annotations = annotations.filter(current => current.id !== note.id);
      pendingSelection = null;
      renderPassage(); renderAnnotationControls();
    });
    item.append(content,remove);
    return item;
  }));
}

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  pendingSelection = null;
  if (selection && !selection.isCollapsed && selection.rangeCount && !$('practice').hidden) {
    const range = selection.getRangeAt(0);
    if ($('readingText').contains(range.startContainer) && $('readingText').contains(range.endContainer)) {
      const prefix = document.createRange();
      prefix.selectNodeContents($('readingText'));
      prefix.setEnd(range.startContainer,range.startOffset);
      const start = prefix.toString().length, text = range.toString();
      if (text.trim()) pendingSelection = { start, end: start + text.length, text, source:'passage' };
    } else {
      const begin=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
      const option=begin.closest?.('.option');
      if(option&&$('questions').contains(option)&&option.lastElementChild.contains(range.startContainer)&&option.lastElementChild.contains(range.endContainer)){
        const term=range.toString().trim(),optionText=option.lastElementChild.textContent;
        const prompt=option.closest('.question-card').querySelector('.question-prompt').textContent;
        if(term)pendingSelection={text:term,source:'option',lookup:{term,context:optionText+' Question: '+prompt.slice(0,Math.max(0,1850-optionText.length))}};
      }
    }
  }
  renderAnnotationControls();
});

function annotate(type) {
  if (!pendingSelection) return;
  const {start,end} = pendingSelection;
  if (!annotations.some(note => note.start === start && note.end === end && note.type === type)) annotations.push({id:++annotationSequence,start,end,type});
  pendingSelection = null;
  window.getSelection()?.removeAllRanges();
  renderPassage(); renderAnnotationControls();
}
for (const id of ['highlightSelection','questionSelection','translateSelection']) $(id).addEventListener('pointerdown', event => event.preventDefault());
$('highlightSelection').addEventListener('click', () => annotate('highlight'));
$('questionSelection').addEventListener('click', () => annotate('question'));
$('undoAnnotation').addEventListener('click', () => { annotations.pop(); pendingSelection = null; renderPassage(); renderAnnotationControls(); });
$('clearAnnotations').addEventListener('click', () => { annotations = []; pendingSelection = null; renderPassage(); renderAnnotationControls(); });

function setReadingFont(size) {
  const value = Math.max(14,Math.min(28,Number(size) || 16));
  $('readingFontSize').value = value;
  $('fontSizeValue').textContent = value + 'px';
  $('readingText').style.fontSize = value + 'px';
  $('fontSmaller').disabled = value === 14;
  $('fontLarger').disabled = value === 28;
  try { localStorage.setItem('reading-lab-font-size',String(value)); } catch { /* Optional preference storage. */ }
}
$('readingFontSize').addEventListener('input',event => setReadingFont(event.target.value));
$('fontSmaller').addEventListener('click', () => setReadingFont(Number($('readingFontSize').value)-1));
$('fontLarger').addEventListener('click', () => setReadingFont(Number($('readingFontSize').value)+1));
let savedFontSize = 16;
try { savedFontSize = Number(localStorage.getItem('reading-lab-font-size')) || 16; } catch { /* Use default. */ }
setReadingFont(savedFontSize);

function renderVocabulary() {
  $('vocabularyNotes').hidden = !vocabulary.length;
  $('vocabularyCount').textContent = vocabulary.length;
  $('vocabularyList').replaceChildren(...vocabulary.map(entry=>{
    const row=element('li'),text=element('span');text.append(element('strong','',entry.term),element('br'),document.createTextNode(entry.contextualMeaning));
    const remove=element('button','text-button','移除');remove.type='button';remove.setAttribute('aria-label','移除生词 '+entry.term);
    remove.addEventListener('click',()=>{vocabulary=vocabulary.filter(item=>vocabularyIdentity(item)!==vocabularyIdentity(entry));renderVocabulary();renderPassage();updateVocabularyButton();});
    row.append(text,remove);return row;
  }));
}
function updateVocabularyButton(){const added=translationResult&&vocabulary.some(item=>vocabularyIdentity(item)===vocabularyIdentity(translationResult));$('addVocabulary').disabled=!translationResult||added;$('addVocabulary').textContent=added?'已加入本篇生词':'加入本篇生词';}
function showTranslation(result){queueTranslationPosition();translationResult=result;$('translationContent').hidden=false;$('translatedTerm').textContent=result.term;$('generalMeaning').textContent=result.generalMeaning;$('contextualMeaning').textContent=result.contextualMeaning;$('translationGrammar').textContent=result.lemma+' · '+result.partOfSpeech;$('translationContext').textContent=result.context;$('contextTranslation').textContent=result.contextTranslation;if(translationAnchor?.source==='passage')saveTranslatedVocabulary();else updateVocabularyButton();}
$('translateSelection').addEventListener('click',async()=>{
  if(!pendingSelection||translationBusy)return;
  let lookup;try{lookup=pendingSelection.lookup||selectionContext($('readingText').textContent,pendingSelection.start,pendingSelection.end);if(lookup.term.length>200)throw Error('一次请选择 200 字符以内的单词或短语。');}catch(error){return tell(error.message,true);}
  captureTranslationAnchor();
  const version=translationVersion;
  $('translationPanel').hidden=false;$('translationContent').hidden=true;$('translatedTerm').textContent=lookup.term;$('translationStatus').textContent='正在查询常见词义与语境词义…';translationResult=null;queueTranslationPosition();
  const cacheKey=vocabularyIdentity(lookup);
  if(translationCache.has(cacheKey)){showTranslation(translationCache.get(cacheKey));$('translationStatus').textContent='已使用本页查询记录，未再次调用 AI。';return;}
  if(!backendAvailable||(!serverDeepSeekKey&&!$('deepseekKey').value.trim())){$('translationStatus').textContent='请先在文章设置的 DeepSeek 设置中填写密钥。基础出题模式也可以使用翻译。';return;}
  translationBusy=true;renderAnnotationControls();
  try{
    const response=await fetch('./api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...lookup,deepseek:{model:selectedModel(),key:$('deepseekKey').value.trim()}})});
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('翻译接口未就绪，请重启控制台中的服务。');
    if(response.status===404)throw Error('翻译功能刚更新，请在控制台停止服务后再启动，然后刷新网页。');
    const result=await response.json();if(!response.ok)throw Error(result.error||'翻译失败，请稍后重试。');
    if(version!==translationVersion)return;
    translationCache.set(cacheKey,result);if(translationCache.size>200)translationCache.delete(translationCache.keys().next().value);
    showTranslation(result);$('translationStatus').textContent='AI 词义仅供辅助理解，可结合原句核对。';
  }catch(error){if(version===translationVersion)$('translationStatus').textContent=error.message;}
  finally{if(version===translationVersion){translationBusy=false;renderAnnotationControls();}}
});
function saveTranslatedVocabulary(){
  if(!translationResult)return;
  if(!vocabulary.some(item=>vocabularyIdentity(item)===vocabularyIdentity(translationResult))) {
    const entry={...translationResult};
    if(translationAnchor?.source==='passage') {
      const text=$('readingText').textContent;
      const selected=text.slice(translationAnchor.start,translationAnchor.end);
      entry.passageStart=translationAnchor.start+(selected.length-selected.trimStart().length);
      entry.passageEnd=entry.passageStart+selected.trim().length;
    }
    vocabulary.push(entry);
  }
  renderVocabulary();renderPassage();updateVocabularyButton();queueTranslationPosition();
}
$('addVocabulary').addEventListener('click',saveTranslatedVocabulary);
$('closeTranslation').addEventListener('click',()=>{$('translationPanel').hidden=true;});

// Keep the dictionary outside the scrolling reading pane so it cannot be clipped by it.
document.body.append($('translationPanel'));
$('translationPanel').setAttribute('role','dialog');
$('translationPanel').setAttribute('aria-modal','false');
function captureTranslationAnchor(){
  const selection=window.getSelection();
  if(selection?.rangeCount){
    const range=selection.getRangeAt(0).cloneRange();
    translationAnchor={range,rect:range.getBoundingClientRect(),source:pendingSelection?.source,start:pendingSelection?.start,end:pendingSelection?.end};
  }
}
function restoreTranslationRange(){
  if(!translationAnchor||translationAnchor.source!=='passage')return;
  const walker=document.createTreeWalker($('readingText'),NodeFilter.SHOW_TEXT);
  const range=document.createRange();let offset=0,node,startFound=false;
  while((node=walker.nextNode())){
    const end=offset+node.textContent.length;
    if(!startFound&&translationAnchor.start>=offset&&translationAnchor.start<end){range.setStart(node,translationAnchor.start-offset);startFound=true;}
    if(startFound&&translationAnchor.end<=end){range.setEnd(node,translationAnchor.end-offset);translationAnchor.range=range;return;}
    offset=end;
  }
}
function queueTranslationPosition(){
  if(translationFrame!==null)return;
  translationFrame=requestAnimationFrame(()=>{translationFrame=null;positionTranslationPanel();});
}
function positionTranslationPanel(){
  const panel=$('translationPanel');if(panel.hidden||!translationAnchor)return;
  if(!translationAnchor.range.startContainer.isConnected)restoreTranslationRange();
  if(translationAnchor.range.startContainer.isConnected){
    const rectangle=translationAnchor.range.getBoundingClientRect();
    if(rectangle.width||rectangle.height)translationAnchor.rect=rectangle;
  }
  const width=Math.min(360,window.innerWidth-24);
  panel.style.width=width+'px';panel.style.maxHeight=Math.max(1,window.innerHeight-24)+'px';
  const placement=floatingPosition(translationAnchor.rect,{width,height:panel.getBoundingClientRect().height},{width:window.innerWidth,height:window.innerHeight});
  panel.style.left=placement.left+'px';panel.style.top=placement.top+'px';
}
window.addEventListener('scroll',event=>{if(!$('translationPanel').contains(event.target))queueTranslationPosition();},true);
window.addEventListener('resize',queueTranslationPosition);
document.addEventListener('keydown',event=>{if(event.key==='Escape')$('translationPanel').hidden=true;});
new ResizeObserver(queueTranslationPosition).observe($('translationPanel'));

function queueSave() {
  if(!persistenceReady||saveQueued)return;
  saveQueued=true;
  queueMicrotask(()=>{saveQueued=false;saveProgress();});
}
function saveProgress() {
  if(!persistenceReady)return;
  try {
    writeSession(localStorage,{draft:$('passage').value,passage:generationPassage,quiz:currentQuiz,allQuestions,questionIds:questions.map(q=>q.id),answers,submitted,attemptStarted,attemptFinished,annotations,vocabulary,view:$('practice').hidden?'setup':'practice',settings:{mode:$('mode').value,count:$('questionCount').value,difficulty:$('difficulty').value},originalImport:originalUI.getDraft()});
    $('saveStatus').textContent='已自动保存到当前浏览器 · 关闭后重新打开可恢复';
  } catch {
    $('saveStatus').textContent='自动保存失败：浏览器存储不可用或已满。请先下载 Word 复盘。';
  }
}
function restoreProgress() {
  let saved;try{saved=readSession(localStorage);}catch{return;}
  if(!saved)return;
  $('passage').value=saved.draft;countWords();
  originalUI.restore(saved.originalImport);
  $('mode').value=saved.settings.mode==='ai'&&!backendAvailable?'basic':saved.settings.mode;
  updateOriginalMode();
  $('questionCount').value=saved.settings.count;$('difficulty').value=saved.settings.difficulty;
  $('difficulty').disabled=$('mode').value!=='ai';
  $('modeHelp').textContent=$('mode').value==='original'?'保留 PDF 自带的题目。识别使用 DeepSeek，先核对再开始；缺少答案可选择 AI 参考答案。':$('mode').value==='ai'?'AI 会生成细节、同义替换、推断和主旨选择题，附中文解析与原文依据。':'基础模式免费使用，根据文章自动生成原文填空题。';
  if(saved.quiz&&saved.allQuestions.length&&saved.passage) {
    currentQuiz=saved.quiz;allQuestions=saved.allQuestions;generationPassage=saved.passage;
    const subset=saved.questionIds.length?saved.questionIds:allQuestions.map(q=>q.id);
    startAttempt(subset.map(id=>allQuestions.find(q=>q.id===id)).filter(Boolean));
    answers=saved.answers;submitted=saved.submitted;
    attemptStarted=saved.attemptStarted||Date.now();attemptFinished=saved.attemptFinished;
    annotations=saved.annotations;annotationSequence=Math.max(0,...annotations.map(n=>n.id));vocabulary=saved.vocabulary;
    $('quizTitle').textContent=currentQuiz.title;
    $('quizMode').textContent=currentQuiz.mode==='original'?'PDF 原题 · 已核对的原文题目':currentQuiz.mode==='ai'?'DEEPSEEK · 理解与推断':'BASIC READING · 原文填空选择题';
    renderPassage();renderVocabulary();renderAnnotationControls();renderQuestions();updateProgress();
    if(submitted)renderSubmittedResult();
    $('setup').hidden=saved.view==='practice';$('practice').hidden=saved.view!=='practice';
    if(saved.view==='setup') { $('step1').classList.add('active');$('step2').classList.remove('active');$('step3').classList.remove('active'); }
    if(saved.view==='practice')requestAnimationFrame(()=>$('practice').scrollIntoView({block:'start'}));
  }
  $('saveStatus').textContent='已恢复上次学习进度 · 后续修改会自动保存';
  if(saved.draft||saved.quiz)tell('已恢复上次的文章和学习进度，可以继续。');
}
for(const id of ['mode','questionCount','difficulty'])$(id).addEventListener('change',queueSave);
window.addEventListener('pagehide',saveProgress);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveProgress();});
function updateOriginalMode(){const original=$('mode').value==='original';$('originalTools').hidden=!original;$('generate').hidden=original;$('questionCount').disabled=busy||original;$('difficulty').disabled=busy||original||$('mode').value!=='ai';if(original)$('modeHelp').textContent='保留 PDF 自带的题目。识别使用 DeepSeek，先核对再开始；缺少答案可选择 AI 参考答案。';}
const originalUI=originalImportUI({getPDF:()=>pdf,getSettings:()=>({available:backendAvailable,configured:serverDeepSeekKey,model:selectedModel(),key:$('deepseekKey').value.trim()}),setBusy,tell,onStart:article=>activateQuiz(article,article.passage),onChange:queueSave});
restoreProgress();
persistenceReady=true;
