# PDF 解析、索引恢复与验证

PDF 使用一条自动分流链路。PDF.js 优先保留原生文字和坐标。扫描正文使用 PaddleOCR，文字型位图在本地检测文字和结构，明确图表交给视觉模型，边界不确定时按需调用一次 PP-DocLayout-M。问答读取索引中的文字证据。

## 运行

本地模型服务位于 `services/pdf-analysis`，使用 Python 3.11。按照该目录 README 完成依赖安装、模型准备和校验后启动；默认地址为 `http://127.0.0.1:8091`。模型准备与启动分离，启动不应自动接受被替换的权重。服务 `/health` 就绪后，设置后端环境：

```dotenv
PDF_ANALYSIS_URL=http://127.0.0.1:8091
PDF_ANALYSIS_TIMEOUT_MS=95000
VISION_ENABLED=true
VISION_CONCURRENCY=3
VISION_MODEL=qwen3.8-flash
VISION_BASE_URL=
VISION_API_KEY=
VISION_TIMEOUT_MS=180000
VISION_REQUEST_TIMEOUT_MS=60000
VISION_OUTPUT_TOKENS=8192
INDEX_DOCUMENT_CONCURRENCY=2
PAGE_ASSETS_DIR=.data/pages
```

也可初始化独立容器的模型卷后启动：

```sh
docker compose --profile pdf-analysis build pdf-analysis
docker compose --profile pdf-analysis run --rm pdf-analysis python prepare.py download --models /models
docker compose --profile pdf-analysis run --rm pdf-analysis python prepare.py seal --models /models
docker compose --profile pdf-analysis run --rm pdf-analysis python prepare.py warmup --models /models
docker compose --profile pdf-analysis up -d pdf-analysis
```

容器内模型服务地址与开发机地址不同；若 Worker 也在容器内，配置为 `http://pdf-analysis:8091`。服务端口仅绑定开发机回环地址，不提供面向浏览器的接口。

API 和 Worker 使用一致的配置和资源目录。请从旧环境删除 `PDF_ANALYSIS_MODE` 与 `PDF_ANALYSIS_NATIVE_FAST_PATH`，两项配置均已停用。升级本地模型服务后再启动新版 Worker。纯文字与明确矢量图无需访问本地模型，遇到需要本地模型的内容时，服务故障会让任务明确失败。`VISION_ENABLED=false` 仅提取原生文字。

视觉服务地址和密钥为空时继承 `CHAT_BASE_URL` 和 `CHAT_API_KEY`。API 与 Worker 共享持久化的 `PAGE_ASSETS_DIR` 和 `ORIGINALS_DIR`。视觉并发可设为 1～8，多 Worker 的总并发为各进程之和。

在 `nestjs` 运行 `npm run build`，再运行 `npm run start:worker`。本地可用 `npm run start:worker:dev` 编译后启动，热更新使用 `npm run start:worker:watch`。

## 数据与质量

- 普通或分片上传进入同一后台任务。识别完成的页面按原顺序输出，切块与后续页面的识别重叠。百炼向量请求每批最多 10 条，同一进程最多两批并行。
- 全部切块和向量写入成功后发布索引。重建中仍可查询旧索引，取消或失败不会切换可用版本。历史引用继续按原路径读取。
- 纯文字页不渲染，也不调用本地模型或百炼。确认纯文字的图片复用文字检测框做 OCR，文本密集的流程图仍需视觉理解。
- OCR 置信度或覆盖不足时，只对缺失文字区域或当前裁剪补识别。接口超时和服务错误直接报告。整页视觉保留给无法可靠分离的页面。
- 布局、OCR、图解和向量缓存按用户、文档及版本隔离，绑定输入和模型配置。缓存复用的描述和向量重新绑定本次来源及索引。

正文使用 `[图片文字识别]`、`[表格识别]`、`[模型生成的图解]` 区分来源。图片描述建立检索子块，附近正文参与向量、关键词及重排；原文证据分别保留准确偏移，命中后一起展开。普通及流式问答只发送文字证据，不再发送图片，也不会声称核对了原图。

## 缓存、引用与兼容

资源路径按用户、文档、版本、配置指纹隔离。新区域资源为 `<页码>-<区域标识>.png/json`，包含归一化边界框、区域类型、上下文及原生文字校验值、图片字节数与 SHA-256。配置指纹包含分流/裁剪版本、模型、地址、提示词和渲染预算，不含密钥。成功区域独立复用；失败重试不重复调用同页已成功的区域。模型错误不会改用整页请求重试。

取消、替换及删除会检查任务执行权。全部解析和向量写入成功后才切换索引；失败继续服务已有索引。删除后立即拒绝图片访问，后台清理资源。

新引用使用 `location.regionImage = { versionId, page, profile, regionId, bbox, kind }`。`bbox` 为旋转后页面左上角起始的归一化 `[x0,y0,x1,y1]`；`kind` 为 `region`、`scan` 或 `fallback`。附近正文通过 `relatedParagraphs` 关联。引用面板展示识别文字和对应局部图/整页来源。

```text
GET /api/documents/:id/versions/:versionId/pages/:page/regions/:regionId/image?profile=<指纹>
GET /api/documents/:id/versions/:versionId/pages/:page/image?profile=<指纹>  # 历史引用
Authorization: Bearer <token>
```

两种接口均校验用户、知识库、文档、版本和删除状态，返回 `image/png`、`private, no-store`。前端使用鉴权 Blob URL，切换或关闭引用时释放。

无需数据库迁移；保留旧 `pageImage` 和历史索引。已有 PDF 点击“重建索引”后应用新分流；缺少原件的历史 PDF 提示重新上传。关闭 `VISION_ENABLED` 后仍可提取文字。Markdown 和长文分析覆盖范围保持现有行为。

原件阅读、坐标高亮和旧引用的降级方式详见 [来源阅读器指南](pdf-source-viewer.md)。

## 索引恢复

- 文档队列默认同时处理 2 份文档（`INDEX_DOCUMENT_CONCURRENCY=1|2`）。进程内视觉、图像和本地 OCR 配额共享；多 Worker 部署仍需按供应商总配额配置。
- 视觉单次请求默认 60 秒（`VISION_REQUEST_TIMEOUT_MS`），区域总期限仍为 `VISION_TIMEOUT_MS`。页面调度模式把瞬态失败延后至其他页处理完成后补齐，避免叠加就地请求重试；直接区域调用保留一次瞬态重试。429 尊重共享冷却。
- 页面完成后立即写入有完整性校验的磁盘缓存，其他空闲槽位继续处理后续页。内存只保留活动页面和按序组装的相邻页面。所有页面最终按原页码组装。
- 页面缓存保存跨页表格链接前的原始结果；重放时重新建立跨页关系。来源、视觉配置、解析版本变更失效；使用本地模型的页面单独验证 manifest。纯原生页面无需等待 OCR 健康检查。
- 缓存引用的 PNG 会校验内容摘要，损坏/丢失时重新生成。账号、文档和版本目录隔离。
- 已确认向量批次保存内容检查点，重试会同时核对实际向量是否仍存在。变化批次覆盖写入，完成时仅删除多余尾部，不再清空整个隐藏索引。
- 索引执行使用 60 秒 SQL 租约、每 10 秒续租；重复领取等待，自动尝试最多 3 次。Redis 孤儿恢复单独持久计数和退避，手动重试重置恢复预算。取消后遗留执行令牌有独立清理路径。
- Worker 日志新增任务/文档/尝试/请求标识、请求用量、锁失效及事件循环延迟。任务内部保存尝试历史、视觉调用与缺失用量计数；不保存提示词和模型凭据到诊断字段。

首次运行新版会补齐页面级缓存，已有区域识别缓存仍可复用。

## 基准

先独立编译，避免改写开发服务正在监视的 dist：

```powershell
cd nestjs
npx tsc -p tsconfig.json --outDir .data/hybrid-build
node scripts/pdf-hybrid-benchmark.cjs --file "<PDF绝对路径>" --build-dir .data/hybrid-build --pages 39,74
```

默认只调用本地服务，视觉响应为模拟数据；报告不能用来证明图表语义识别正确。去掉 `--pages` 检测整份 PDF。脚本分别记录首次和缓存重跑。`--delay-ms` 设置模拟视觉延迟。报告只保存统计和服务提供的 token 用量，不保存提示词、正文和密钥。

本地模型未就绪时可加 `--mock-local` 检查裁剪、调度和缓存，模型结果以固定模拟响应代替。该参数会改变分流结果，只用于工程验证，不能与 `--live` 同时使用。

`--live` 才启用真实视觉请求，全次运行硬性限制 12 次调用（包括结构修复），达到上限明确失败并保存已完成报告。请仅选少量真实图表页；不要对完整旧文档发出数百次付费基线请求。

人工验收锚点在 `nestjs/test/fixtures/pdf-hybrid-gold.json`。CH3 176 页旧本地算法为 490 个候选区域（234 个面积小于 5%）；候选数量不是实际计费次数。第39页预期零视觉请求，第74页完整保留底部时隙图。应同时核对重要图表、数字、关系、页码和有效分辨率，再评估调用数、实际token、总时延和内存。

统一后的两页工程回归使用 `--mock-local --delay-ms 500`。第 39 页零识别请求，第 74 页有一个局部视觉请求（85,104 像素），裁剪保留时隙图及编号。两页合计首次约 1.00 秒，缓存重跑约 0.08 秒且没有识别请求。该数据只含解析阶段，本地和云端模型输出均为模拟响应。

2026-11-04 全量旧流程模拟基线：176页、490次模拟视觉请求，本地处理加每次5ms模拟延迟合计23.40秒；缓存重跑5.25秒、零模型请求。报告位于本地 `.data/ch3-hybrid-baseline/report.json`。该数据仅核实候选数、裁剪成本和缓存行为，绝不是百炼真实识别速度。

### 视觉基准与日志

`node scripts/vision-concurrency-benchmark.cjs --live --file <物理层PDF> --build-dir <构建目录>` 对第 23、26、27 页各一个区域进行并发 1/3 对比，使用独立缓存，合计 6 次真实视觉调用。2026-11-02 样例：串行 30.37 秒、并发 11.99 秒，两组均为 3 次调用、输入 1947 token；输出分别为 697/651 token。耗时包含网络与模型波动，不代表固定加速倍数。原始报告位于 `.data/concurrency-benchmark/1793609651390/report.json`。

```powershell
cd nestjs
npm test
npm run test:e2e
npm run build
npm run test:vision -- --live       # 合成混排样例解析 + 纯文字问答
npm run test:vision -- --live --scan
node scripts/pdf-regions-benchmark.cjs --file <PDF路径> --pages 2,23
# 加 --live 对所选页面分别进行整页基线与区域解析，产生真实费用
# --build-dir 可指定独立构建目录；--output 可指定报告目录
```

`pdf-document-layout` 记录文字页、区域、扫描页与兜底页数；`pdf-page-layout` 记录兜底原因和本地耗时；`pdf-region` 记录缓存命中、图片像素/字节与调用耗时；`vision_usage` 记录模型服务报告的输入/输出 token。日志不记录密钥或正文。

区域总数在页面定位结束前未知，界面显示活动进度条与“已识别 X 个区域（总量统计中）”，总数确定后切换为实际百分比；区域数量不是 PDF 页数。定位首个页面后即上报 0/未知，避免等待首个模型返回才出现活动状态。

视觉输出中的合法空文本块会被过滤。JSON 无法解析或 blocks/type/text 结构不符时，仅对当前区域追加明确格式要求并自动修复一次；成功后正常缓存，二次仍异常则报告具体页码、区域与字段。传输超时、限流及取消不走格式修复；修复请求沿用并发配额、取消信号和冷却机制。`vision-output-repair` 只记录结构诊断，不保存原始模型文本，因此无法回溯旧日志未保存的失败响应。正常识别不增加调用，格式修复最多额外调用一次。

2026-11-02 用用户物理层课件第 2、23 页真实对比：整页方式 2 次调用，输入 3,647、输出 122 token，输入图片 3,110,400 像素，约 4.45 秒；区域方式 1 次调用，输入 656、输出 131 token，393,078 像素，约 2.35 秒。第 2 页跳过视觉，第 23 页保留光纤结构与全反射关系描述。报告位于本地忽略目录 `.data/region-benchmark/physics-ready/report.json`。这是少量样例结果，耗时受网络影响，不能作为固定节省率。

## 历史基线（统一前）

主要根因是 PDF.js `constructPath(endPath)` 只建立裁剪范围，其记录边界可能包含后续文字；旧算法把它当作绘图。当时的兼容与混合流程都修正了这类误判，保留真正的绘制操作、图片和图表。表中流程为统一分流前的历史对照。

同一176页CH3、文档缓存为空、视觉响应固定模拟500ms、并发3，解析阶段结果如下（不包含向量化）：

| 流程                         | 区域 | 模拟视觉调用 | 本地版面/OCR调用 | 解析耗时 |
| ---------------------------- | ---: | -----------: | ---------------: | -------: |
| 改造前                       |  490 |          490 |              0/0 |  91.24秒 |
| 优化后的默认兼容流程         |   86 |           86 |              0/0 |  22.14秒 |
| 混合流程，逐页模型判断       |   93 |           85 |            139/9 | 274.04秒 |
| 混合流程，开启原生图文快路径 |   82 |           79 |             74/3 | 149.58秒 |

这些历史数据只用于对照，采样内存仅包含 Node 进程，不包含 Python 模型进程。

真实本地模型验收：第39页零区域/零模型；第74页一个完整时隙图（48,111像素）；中文扫描文字2行及CRC/FCS均识别，最低置信度0.9577。真实百炼验证共3次：CH3第74页407 token，CH2第23页两次1052/975 token，合计2434 token；输入均为局部图，未对整份文件进行付费对照。图解属于模型生成内容，引用保留原图供核对。固定样例不是所有图表语义都准确的保证。

原始报告分别在 `nestjs/.data/ch3-original-delay500`、`ch3-fixed-delay500`、`ch3-final-hybrid-all`、`ch3-final-hybrid-native-regions`、`ch3-final-live`、`physics-final-live` 和 `physics-final-live-v2`。这些本地报告不提交文档正文与图片到Git。
