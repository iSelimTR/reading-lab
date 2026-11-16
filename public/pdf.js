import * as pdfjs from './vendor/pdfjs/build/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/build/pdf.worker.mjs', import.meta.url).href;

export async function openPDF(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('PDF 超过 30 MB，请先拆分文件。');
  const data = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder('latin1').decode(data.slice(0, 1024));
  if (!header.includes('%PDF-')) throw new Error('这份文件不是有效的 PDF，请重新选择。');
  return pdfjs.getDocument({
    data,
    cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
    wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href,
    isEvalSupported: false
  }).promise;
}

export function textFromItems(items) {
  let text = '';
  let previousY = null;
  let previousEnd = null;
  let previousHadEOL = false;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5] ?? previousY;
    const x = item.transform?.[4] ?? 0;
    if (text && !previousHadEOL) {
      if (previousY !== null && Math.abs(y - previousY) > 4) text += '\n';
      else if (!text.endsWith(' ') && previousEnd !== null && x - previousEnd > 1) text += ' ';
    }
    text += item.str;
    if (item.hasEOL) text += '\n';
    previousY = y;
    previousEnd = x + (item.width || 0);
    previousHadEOL = item.hasEOL;
  }
  return text.replace(/([a-z])-\s*\n\s*([a-z])/gi, '$1$2').trim();
}

export async function extractPDF(pdf, { start, end, forceOCR, language, onProgress, signal }) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > pdf.numPages || end < start) {
    throw new Error(`请输入 1–${pdf.numPages} 以内的有效页码范围。`);
  }
  if (end - start + 1 > 20) throw new Error('每次最多识别 20 页。建议只选一篇文章所在的页面。');
  let worker = null;
  const pages = [];
  let ocrPages = 0;
  const abort = () => signal?.throwIfAborted();
  try {
    for (let number = start; number <= end; number++) {
      abort();
      onProgress(`正在读取第 ${number} / ${end} 页…`);
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      let text = textFromItems(content.items);
      const letters = text.match(/[A-Za-z\u4e00-\u9fff]/g)?.length || 0;
      if (forceOCR || letters < 60) {
        ocrPages++;
        if (!globalThis.Tesseract) throw new Error('OCR 组件加载失败，请刷新页面后再试。');
        if (!worker) {
          onProgress('正在准备文字识别，首次使用需下载语言包…');
          worker = await globalThis.Tesseract.createWorker(language, 1, {
            workerPath: new URL('./vendor/tesseract/worker.min.js', import.meta.url).href,
            corePath: new URL('./vendor/tesseract-core/', import.meta.url).href,
            logger: info => {
              if (info.status === 'recognizing text') onProgress(`正在识别扫描页 ${number}，进度 ${Math.round(info.progress * 100)}%…`);
            }
          });
        }
        abort();
        const viewport = page.getViewport({ scale: 2 });
        if (viewport.width * viewport.height > 20_000_000) throw new Error('页面尺寸过大，请先将 PDF 缩小为普通 A4 尺寸。');
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        abort();
        const result = await worker.recognize(canvas);
        text = result.data.text.trim();
        canvas.width = canvas.height = 0;
      }
      abort();
      pages.push(text);
      page.cleanup();
    }
    const text = pages.filter(Boolean).join('\n\n');
    if (text.trim().length < 40) throw new Error('没有识别到足够文字，请检查页面、扫描清晰度或识别语言。');
    return { text, ocrPages, pageCount: pages.length };
  } finally {
    if (worker) await worker.terminate();
  }
}
