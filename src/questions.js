const STOP_WORDS = new Set(`about above after again against also although always among another around because become before being below between both cannot could during each either enough even every first following found from further given have however into itself later little many might more most much must neither never only other over rather same several should since some still such than that their them then there these they this those through under until upon used using very were what when where whether which while whom whose will with within without would your according passage information sentence`.split(/\s+/));

export function normalizeText(text) {
  return String(text).normalize('NFKC').replace(/[\u00ad\u200b]/g, '')
    .replace(/([a-z])-\s*\n\s*([a-z])/gi, '$1$2')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const index = Math.floor(random() * (i + 1));
    [result[i], result[index]] = [result[index], result[i]];
  }
  return result;
}

function candidates(sentence) {
  return [...sentence.matchAll(/(?<![\p{L}])[\p{Script=Latin}][\p{Script=Latin}-]{4,}(?![\p{L}])/gu)]
    .filter(match => !STOP_WORDS.has(match[0].toLowerCase()) &&
      (match.index === 0 || match[0][0] === match[0][0].toLowerCase()));
}

export function generateBasicQuiz(text, count = 5, random = Math.random) {
  const source = normalizeText(text);
  if (source.length < 150) throw new Error('文章太短。请至少提供一段约 80 个英文单词的文章。');
  if (!Number.isInteger(count) || count < 3 || count > 15) throw new Error('题目数量应为 3–15。');
  const sentences = String(text).split(/\n\s*\n/).flatMap(paragraph =>
    normalizeText(paragraph).split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/))
    .filter(sentence => {
      const words = sentence.split(/\s+/).length;
      const metadata = /academic reading sample task|adapted with permission|copyright|all rights reserved|©|\[note:|choose (one|no more than)|write your answers/i;
      return words >= 9 && words <= 85 && !metadata.test(sentence) && candidates(sentence).length >= 2;
    });
  const pool = [...new Set(sentences.flatMap(sentence => candidates(sentence).map(match => match[0].toLowerCase())))];
  if (pool.length < 4 || sentences.length < 3) {
    throw new Error('目前只能识别出少量完整英文句子。请检查识别结果，补充至少三句完整的英文正文后再生成。');
  }
  const usedWords = new Set();
  const usedSentences = new Set();
  const questions = [];
  for (const sentence of shuffled(sentences, random)) {
    if (usedSentences.has(sentence.toLowerCase())) continue;
    const words = candidates(sentence).filter(match => !usedWords.has(match[0].toLowerCase()));
    if (!words.length) continue;
    const ranked = words.sort((a, b) => b[0].length - a[0].length);
    const chosen = ranked[Math.floor(random() * Math.min(3, ranked.length))];
    const answer = chosen[0];
    const distractors = shuffled(pool.filter(word => word !== answer.toLowerCase()), random).slice(0, 3)
      .map(word => /^[A-Z]/.test(answer) ? word[0].toUpperCase() + word.slice(1) : word);
    const options = shuffled([answer, ...distractors], random);
    const statement = sentence.slice(0, chosen.index) + '________' + sentence.slice(chosen.index + answer.length);
    questions.push({
      id: `q-${questions.length + 1}`,
      type: '原文填空',
      prompt: `According to the passage, which word completes this statement?\n\n${statement}`,
      options,
      answerIndex: options.indexOf(answer),
      explanation: `原文在这个位置使用了 “${answer}”。结合空格两侧的内容，核对词义与句子结构。`,
      evidence: sentence
    });
    usedWords.add(answer.toLowerCase());
    usedSentences.add(sentence.toLowerCase());
    if (questions.length === count) break;
  }
  if (questions.length < 3) throw new Error('能够可靠出题的句子不足三句。请补充更多英文正文。');
  return { title: '我的阅读练习', mode: 'basic', questions };
}

export function validateQuiz(quiz, source, expectedCount) {
  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length !== expectedCount) {
    throw new Error('AI 返回的题目数量不正确，请重试。');
  }
  const passage = normalizeText(source).toLowerCase();
  const prompts = new Set();
  const questions = quiz.questions.map((question, index) => {
    const { prompt, options, answerIndex, explanation, evidence } = question;
    if (typeof prompt !== 'string' || prompt.trim().length < 10 || prompt.length > 2000 ||
        !Array.isArray(options) || options.length !== 4 ||
        options.some(option => typeof option !== 'string' || !option.trim() || option.length > 800) ||
        new Set(options.map(option => option.trim().toLowerCase())).size !== 4 ||
        !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3 ||
        typeof explanation !== 'string' || explanation.trim().length < 5 || explanation.length > 3000 ||
        typeof evidence !== 'string' || evidence.trim().length < 15 || evidence.length > 3000 ||
        !passage.includes(normalizeText(evidence).toLowerCase()) || prompts.has(prompt.trim().toLowerCase())) {
      throw new Error('AI 题目格式或原文依据未通过校验，请重新生成。');
    }
    prompts.add(prompt.trim().toLowerCase());
    return { id: `q-${index + 1}`, type: String(question.type || '阅读理解').slice(0, 30), prompt: prompt.trim(),
      options: options.map(option => option.trim()), answerIndex, explanation: explanation.trim(), evidence: evidence.trim() };
  });
  return { title: typeof quiz.title === 'string' ? quiz.title.slice(0, 120) : '我的阅读练习', mode: 'ai', questions };
}

export function gradeQuiz(questions, answers) {
  const results = questions.map(question => {
    const selected = answers[question.id];
    const answered = Number.isInteger(selected) && selected >= 0 && selected < question.options.length;
    return { id: question.id, selected: answered ? selected : null, correct: answered && selected === question.answerIndex };
  });
  const correct = results.filter(result => result.correct).length;
  return { correct, total: questions.length, percent: questions.length ? Math.round(correct / questions.length * 100) : 0, results };
}

export const DEMO_TEXT = `Urban trees can reduce the temperature of city streets by providing shade and releasing moisture into the air. Researchers have found that neighbourhoods with fewer trees often experience more intense summer heat than greener areas nearby.

However, planting trees is only the beginning of a successful project. Young trees require regular watering, suitable soil and protection from damage during their first years of growth. Without this maintenance, many trees die before they can provide substantial shade.

The choice of species also influences the long-term benefits of urban planting. A species that grows well in one climate may struggle in another, especially if future summers become hotter or drier. Local planners therefore need to consider both current conditions and likely environmental changes.

Community participation can improve the survival of newly planted trees. When residents help choose planting locations and take responsibility for watering, they are more likely to notice problems early. This cooperation can also strengthen relationships between neighbours.

Although trees offer important benefits, they cannot replace every other response to extreme heat. Cities also need accessible drinking water, cooler indoor spaces and support for vulnerable residents. A combination of measures can protect more people than any single intervention.`;
