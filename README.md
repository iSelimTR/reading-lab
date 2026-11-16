# Reading Lab 阅读练习室

上传 PDF，识别文章，生成四选一阅读题，提交后查看分数、中文解析和原文依据。界面支持手机、平板和电脑。

## 功能

- 读取文字 PDF，选择起止页，查看并修改识别结果。
- 扫描件自动使用 Tesseract OCR，也能手动强制 OCR。支持英文和英文加简体中文识别。
- 直接粘贴正文，或用内置原创文章体验完整流程。
- 基础模式自动生成英文原文填空选择题，无需 API Key。
- 可选 AI 模式，根据正文生成细节、同义替换、词义、推断和主旨选择题。
- 提交后批改，显示正确选项、解析和证据，支持错题重练、全部重练及下载 JSON 练习记录。
- 提供 GitHub Pages 自动部署工作流。

## 本地启动

安装 Node.js 22 或更高版本，在这个项目目录打开终端。

```bash
npm install
npm start
```

打开终端显示的 `http://127.0.0.1:3000`。如果使用 pnpm，可以执行 `pnpm install` 和 `pnpm start`。

练习流程是选择 PDF、选择正文页码、识别页面、检查正文、生成练习、选择答案、提交批改。每次最多识别 20 页，文件上限 30 MB，出题正文上限 30000 字符。建议一次处理一篇文章，去掉已有答案和页眉。当前题目生成主要针对英文文章。

扫描件首次使用需要联网下载识别模型，可能需要等待。OCR 质量受图片清晰度、旋转和栏式排版影响，识别结果可手动修正。文字 PDF 优先直接提取，无需 OCR。

## 上传 GitHub 并让手机使用

将 **本项目文件夹内的内容** 上传到一个新的 GitHub 仓库根目录，包括隐藏的 `.github` 文件夹。不要上传 `node_modules`、`.pnpm-store`、`dist` 或个人 PDF。

在 GitHub 仓库打开 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。推送到 `main` 或 `master`，或在 Actions 页面手动运行 `Build and deploy Reading Lab`。工作流完成后，Pages 页面会给出网址。手机和电脑都能打开这个地址。

GitHub Pages 提供基础模式和浏览器内 PDF/OCR。AI 模式需要运行下面的 Node 服务端。页面所有资源使用相对路径，兼容 `https://用户名.github.io/仓库名/` 形式的地址。

本地生成静态站点可运行 `npm run build`。输出在 `dist`，部署时保持目录结构，并通过 HTTP/HTTPS 访问。直接双击 `index.html` 的 `file://` 地址无法正常加载模块。

## 开启 AI 阅读理解题

复制 `.env.example` 为 `.env`，在运行服务器的机器上填写配置。

```dotenv
OPENAI_API_KEY=你的API密钥
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

重启 `npm start`，网页的 AI 选项会自动启用。接口使用 Chat Completions 的严格 JSON Schema。兼容服务需要支持 `response_format.type=json_schema` 和配置的模型。

API 使用可能计费，按所用服务的价格计算。密钥只保留在服务器 `.env`，该文件已经在 `.gitignore` 中排除。GitHub Actions Secrets 不会使纯静态 GitHub Pages 具备服务端 AI 能力。

想让同一 Wi-Fi 下的手机访问本地 AI 服务，在 `.env` 设置以下内容，用手机访问电脑的局域网 IP 和端口。

```dotenv
HOST=0.0.0.0
PORT=3000
APP_PASSWORD=设置一个自己的访问密码
```

浏览器会弹出密码框，用户名可任意填写，密码使用 `APP_PASSWORD`。如果部署到公网，应使用提供 HTTPS 的 Node 托管服务，并配置相同环境变量。配置 API Key 后，对外监听必须同时设置站点密码。服务端不提供公开文件上传接口，只有用户确认后的文章正文会发送给 AI。

## 两种模式的范围

基础模式从文章中选取完整句子，挖空一个词，配四个选项，答案直接来自原文。它适合练习词汇定位和信息核对。材料不足时会提示或减少题数，最低生成三题。

AI 模式生成更完整的理解题，服务端会校验题目结构、选项去重、答案索引、题数及引用依据确实存在于原文。语义判断仍可能出错，复盘时可以用显示的依据核对。AI 生成题不作为官方 IELTS 分数换算依据。

## 验证

```bash
npm test
npm run build
```

测试覆盖基础题生成、计分、重复材料、无效输入、AI 响应校验、AI 服务故障、服务端文件访问隔离和访问密码。AI 接口测试使用模拟响应，实际模型需要配置密钥后自行调用验证。

## 目录

```text
public/             网页界面、PDF 读取和 OCR
src/questions.js    基础出题、AI 结果校验和批改
src/server.js       静态文件服务和 AI 接口
scripts/build.mjs   GitHub Pages 静态打包
test/               Node 内置测试
.github/workflows/  自动检查和 GitHub Pages 部署
```

## 技术资料

- [PDF.js](https://mozilla.github.io/pdf.js/)
- [Tesseract.js](https://github.com/naptha/tesseract.js)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## License

MIT，见 `LICENSE`。PDF.js、Tesseract.js 及其依赖沿用各自许可证，构建时保留依赖包中的许可证文件。
