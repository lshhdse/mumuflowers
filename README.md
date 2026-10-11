# MuMu Flowers

为安卓手机设计的私人花园记录应用。暖白和深绿主题，磨砂浮层、页面返回过渡和触感反馈。包含可运行界面、安卓工程、持久化 AI 后台及 GitHub 版本发布与更新检查。

## 已实现

- 相机拍照 / 相册导入，安卓优先直接打开手机相册选图，照片在后台线程压缩并去除原图 EXIF 信息。
- 页面、返回、底部导航、卡片和弹窗按高刷新率优化，安卓请求设备支持的刷新率（最高 120Hz）；实际帧率由硬件、WebView 与系统设置决定。
- “我的 → 外观与动效”支持跟随系统、浅色模式和深色模式，保存选择并实时响应系统明暗；输入控件、安卓系统栏一同适配。顶部、底部导航与弹窗使用局部磨砂模糊，正文和提示统一使用主题配色，并覆盖全局文字对比度回归检查。
- 植物档案分为养护、相册、记录三个标签，详细 AI 建议默认折叠。
- 手机和浏览器预览统一使用底部导航，默认花园、养护、我的；在“我的 → 菜单设置”选择显示的入口，修改自动保存，可恢复默认。
- 花卉档案、位置筛选、搜索、收藏、生长相册、浇水 / 盆土检查 / 施肥 / 修剪 / 日记记录。
- 每株花独立的浇水打卡与间隔：确认后显示下一次建议日期，支持调整周期，同一天防重复记录。盆土检查可延后提醒，不会修改上次实际浇水或重置浇水周期。
- 兼容 OpenAI Chat Completions 的视觉模型，识别花卉、观察叶片及土表、生成专属养护指南。
- 持久化后台 AI 队列，最多 2 个并发任务；提交后不必停留，失败可重试、任务可取消、后台重启可恢复。
- 安卓本地系统养护通知，应用关闭后也可提醒。采用普通闹钟调度，不请求精确闹钟权限；实际时间可能受系统省电策略影响。
- “我的”下独立二级页面：个人资料、AI 配置、养护提醒、外观、数据与备份、版本更新、关于。
- 启动、回到前台及使用期间检查新版，展示更新内容并提供立即更新 / 稍后更新；安卓在 App 内下载、校验并调用系统安装界面。
- 完整 JSON 备份（含照片），导入合并；密钥不进入备份。
- 示例花园明确标注，可以清除；示例植物不发系统通知。

## 本地运行

需要 Node.js 22.13+（推荐 24 LTS）。

```powershell
npm ci
npm run dev
```

浏览器访问 http://localhost:5173 。AI 服务监听 127.0.0.1:8787。

首次启动在 `server/data/access-token` 生成后台访问令牌。在“我的 → AI 配置”填写它；浏览器服务地址留空，安卓端填部署的 HTTPS 服务地址。然后填写兼容模型 API 的基础地址（例如 `https://api.openai.com/v1`）、支持视觉输入的模型名称和 API 密钥。密钥仅在后台以 AES-256-GCM 加密保存；客户端只得到是否已配置，不会读取原密钥。

也可复制 `.env.example` 为 `.env`，设置稳定的 `MUMU_ACCESS_TOKEN`。没有真实 API 密钥时，档案、照片、日记、检查周期等功能照常工作；AI 会明确提示配置缺失，不提供伪造结果。

```powershell
npm test
npm run build
npm run test:ui
```

UI 测试需先运行 `npx playwright install chromium`。如使用现有浏览器，可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 为其路径。

## 安卓安装包

安卓 7.0+，需要更新的 Android System WebView。构建需要 JDK 21、Android SDK Platform 36、Build Tools 35+。推荐用 Android Studio 配置工具链。

```powershell
npm run android:sync
npm run android:open
```

Windows 也可以生成固定签名的正式 APK：

```powershell
./scripts/build-android.ps1 -JavaHome '你的 JDK 21 目录'
```

脚本首次生成 `.tools/signing/mumu-release.jks` 和 `.tools/signing/credentials.json`，后续复用相同签名。**必须将整个 signing 目录私人备份**，不要上传到仓库；丢失签名将无法覆盖更新已安装应用。APK 输出到 `artifacts/`。本地 `android/local.properties` 应指向你的 SDK 目录，且不提交。

## 发布新版本并提醒更新

每次发版先同步 package.json、package-lock.json、src/version.json 和安卓的 versionName / versionCode，在 src/version.json 与 CHANGELOG.md 写明本次更新内容。使用已有签名构建 APK，提交并推送到 GitHub main 后运行：

```powershell
npm run release:publish
```

发布脚本读取本机 GitHub 凭据（也可使用 GITHUB_TOKEN），创建草稿、上传并校验 APK 与 update.json 更新清单，最后公开为最新 Release。网络中断后重新运行可恢复同一版本，不会提前发布没有安装包的更新。

应用启动、返回前台及使用期间会自动检查新版，同一运行期间每 5 分钟最多检查一次。“稍后更新”仅本次会话忽略此版本；重新启动可再次提示。“我的 → 版本更新”随时手动检查。安卓优先读取最新 Release 的 update.json，兼容旧发布的 GitHub API 检查。

1.0.4 起，“立即更新”通过安卓 DownloadManager 在后台下载安装包，显示进度、支持取消和失败重试；关闭弹窗或重启应用后可继续查看下载。下载后校验大小、SHA-256、包名、版本和当前应用签名，随后请求系统安装。首次安装需在安卓设置允许 MuMu Flowers 安装应用，返回后继续打开安装界面，用户确认后覆盖安装保留本机数据。网页预览提供 APK 下载链接。较旧的已安装版本需要先完成一次 1.0.4 的覆盖安装，之后才能使用新更新流程。

## 后台部署

真正的后台 AI 需要独立常驻的服务，手机关闭应用后服务仍然运行。花卉档案保存在手机；只有发起分析时选用的最近植物照片、最近土表照片及备注会上传到你配置的后台和模型服务。

```sh
docker compose up -d --build
```

Compose 将端口绑定在服务器 loopback；用 Caddy / Nginx 提供 HTTPS 反向代理到 `127.0.0.1:8787`，在 `MUMU_ALLOWED_ORIGINS` 加入你的网页域名，同时保留 `https://localhost`（安卓应用来源）。把访问令牌填入手机的 AI 配置。不要将未加密 HTTP 暴露到公网。

- 这是个人单用户服务，同一访问令牌的设备共用 AI 配置与任务。没有实现多租户账户体系。
- `server/data` / Docker 数据卷包含加密任务、设置及加密密钥。迁移时必须一起备份，或设置稳定的 `MUMU_ENCRYPTION_KEY`（64 位十六进制）。Windows 请保持目录仅当前用户可访问。
- 后台任务保留 30 天，定期启动时清理完成 / 失败 / 取消任务。前端重新打开会同步结果；首版不包含云推送，AI 完成不会在关闭应用时额外推送。已安排的安卓养护通知独立于后台运行。
- 本地模型可在服务端显式设置 `MUMU_ALLOW_LOCAL_AI_HTTP=true`；默认只允许公开 HTTPS 模型地址并拒绝私网地址。此选项只应用于可信个人服务。
- 照片不能测量盆土内部含水率、pH 或养分。AI 的土表观察和检查周期是参考，需要结合手动湿度检查确认；“采用检查计划”需要用户主动点击。
- 浏览器是预览入口；安卓 APK 内置界面及示例照片，可离线记录。浏览器通知只在页面打开时检查，不承诺关闭页面后的提醒。

## 工程结构

```
src/                 React + TypeScript 界面、IndexedDB 本地数据
src/lib/native.ts    相机、压缩、触感、安卓通知
src/lib/api.ts       后台提交、同步、失败恢复
server/              Node.js HTTP 服务、SQLite 队列、密钥加密、视觉分析
android/             Capacitor 8 原生安卓工程
tests/               浏览器实际操作测试
.github/workflows/   验证与自动构建 / 发布
```

## 参考与素材

接口按照 [OpenAI 官方视觉输入文档](https://developers.openai.com/api/docs/guides/images-vision) 实现，可配置其他兼容服务。安卓功能参照 [Capacitor Android](https://capacitorjs.com/docs/android)、[Camera](https://capacitorjs.com/docs/apis/camera) 和 [Local Notifications](https://capacitorjs.com/docs/apis/local-notifications) 文档。界面借鉴用户要求的圆角、磨砂层次与自然过渡，没有复制系统应用资源。

示例摄影来自 [Unsplash](https://unsplash.com)，资源链接及摄影页面见 `public/photos/CREDITS.md`；示例名称只作档案体验，不代表经过 AI 的物种识别。
