# Reading Lab 阅读练习室

上传 PDF，识别文章，生成四选一阅读题，提交后查看分数、中文解析和原文依据。界面支持手机、平板和电脑。

## 功能

- 读取文字 PDF，选择起止页，查看并修改识别结果。
- 扫描件自动使用 Tesseract OCR，也能手动强制 OCR。支持英文和英文加简体中文识别。
- 直接粘贴正文，或用内置原创文章体验完整流程。
- 基础模式自动生成英文原文填空选择题，无需 API Key。
- 可选 AI 模式，根据正文生成细节、同义替换、词义、推断和主旨选择题。
- 提交后批改，显示正确选项、解析和证据，支持错题重练、全部重练及下载 Word 复盘文档。
- 提供 GitHub Pages 自动部署工作流。

## 本地启动

Windows 用户安装 Node.js 22 或更高版本后，在项目文件夹打开 PowerShell，首次执行 `npm.cmd install` 安装依赖。以后双击 `start-local.cmd` 会打开桌面控制台并自动启动服务。点击窗口中的链接或「打开网页」进入练习。点击「停止服务」可停止后台，之后可再次启动；关闭控制窗口也会停止它管理的本项目服务。关闭浏览器标签页不会停止后台。重复双击会提示控制窗口已经打开。

启动文件会自动查找 Node.js，不依赖某台电脑的用户名或 Codex 安装版本。也支持在本机的 `.runtime/node.exe` 放置 Node.js 22 或更高版本的可执行文件；该目录不会上传 GitHub。移动项目时请整体移动文件夹，包括 `node_modules` 和本地 `.env`（如果有），然后从新位置启动。

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

重启 `npm start`，网页的 AI 选项会自动启用。OpenAI 默认使用 Chat Completions 的严格 JSON Schema；DeepSeek 官方接口自动使用 JSON Object 模式，并保留本地题目结构和原文依据校验。其他兼容服务可设置 `AI_RESPONSE_FORMAT=json_object`，需支持配置的模型。

API 使用可能计费，按所用服务的价格计算。密钥只保留在服务器 `.env`，该文件已经在 `.gitignore` 中排除。GitHub Actions Secrets 不会使纯静态 GitHub Pages 具备服务端 AI 能力。

想让同一 Wi-Fi 下的手机访问本地 AI 服务，在 `.env` 设置以下内容，用手机访问电脑的局域网 IP 和端口。

```dotenv
HOST=0.0.0.0
PORT=3000
APP_PASSWORD=设置一个自己的访问密码
```

浏览器会弹出密码框，用户名可任意填写，密码使用 `APP_PASSWORD`。如果部署到公网，应使用提供 HTTPS 的 Node 托管服务，并配置相同环境变量。配置 API Key 后，对外监听必须同时设置站点密码。服务端不提供公开文件上传接口，只有用户确认后的文章正文会发送给 AI。

控制台使用 Windows 自带的 PowerShell 和 Windows Forms，无需另装桌面框架。若使用命令行，可运行 `npm start`，结束时按 `Ctrl+C`；也可运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1`。控制台只接管已确认属于当前项目的服务，端口被其他程序使用时会提示，不会关闭其他程序。

## 下载 Word 复盘

程序启动和静态构建会自动准备 Word 导出文件。批改后点击「下载 Word 复盘」，浏览器本地生成真正的 .docx 文档，包含原文、按题号标记的证据高亮、本轮每题选项、你的答案、正确答案与解析。错题会单独标明错选项及复盘说明。它使用已有解析，不额外调用 AI 或产生 API 费用。不能可靠定位的依据会明确标出，不会高亮不确定的位置。

错题重练后导出的是当前一轮的题目和答案；个人高亮及问号标注另列在文档末尾。导出内容不包含 API Key。Word 文档适合保存和打印，导出不再使用 JSON 格式。下载按钮旁会显示准备状态，若浏览器未自动保存，可点击旁边的「点击这里保存 Word 文件」链接。

## 阅读与标注

批改前所有答题选项保持白底，用中性边框表示已选；提交后正确答案标绿，错选答案标红，并显示文字解析。重新练习会清除本轮答题颜色。

阅读原文上方可用字号滑块或 A− / A+ 调节 14–28px 字号，字号偏好保存在本机浏览器。选中原文词句后点击「高亮」或「标问号」，支持重叠和跨段标注、撤销、清空，以及在「我的标注」中逐条移除。手机可长按选择文字。标注在本次练习重做时保留，刷新页面或生成新练习时清空；下载练习记录会包含标注的文字偏移和类型，不包含 API Key。

## 网页上的 DeepSeek 设置

通过本地启动文件启动后，展开「DeepSeek 设置」，点击模型卡片选择 Flash 或 V4 Pro。默认推荐 Flash，价格以设置区的官方链接为准。模型选择不收费，点击生成时才调用 API。

可以在密码框粘贴自己的完整 API Key；仅供当前页面使用，不写入浏览器存储、服务器文件或练习导出。刷新会清空，点击「清除输入」可立即移除。密钥与文章经本站 Node 服务转发到固定的 DeepSeek 官方 HTTPS 接口；请只在自己信任的本地或 HTTPS 部署中输入密钥。留空时使用本地 .env 中已配置的 DeepSeek 密钥，服务端不会把该密钥返回网页。

纯 GitHub Pages 不提供 Node 服务，仍可使用基础模式；页面会明确提示 AI 设置需要本地服务。

## 接入 DeepSeek

在本地项目的 .env 文件填写以下配置（不要上传密钥）：

```dotenv
OPENAI_API_KEY=你的DeepSeek密钥
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-flash
AI_RESPONSE_FORMAT=json_object
```

变量沿用 OPENAI_ 名称，但请求发送到 DeepSeek。修改后关闭原启动窗口，重新双击 start-local.cmd，并刷新网页选择 AI 模式。出题时文章正文会发送给 DeepSeek 并消耗 API 余额；PDF 提取和基础模式不调用付费模型。为控制等待时间和输出长度，DeepSeek 请求关闭思考模式并限制输出；不自动重试付费请求。建议先用演示文章生成三题。

参考：https://api-docs.deepseek.com/zh-cn/guides/json_mode/

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
