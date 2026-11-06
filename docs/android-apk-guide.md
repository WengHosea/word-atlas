# 词光 Word Atlas · 手机端安装与数据包导入操作指南

本文档说明如何用 GitHub Actions 在云端打出 Android 安装包（APK），以及如何把
体积较大的离线媒体包（插画 + 音频）导入手机，让 App 立刻可用。

![应用界面](../docs/today-mobile.jpg)

## 架构速览

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  GitHub Actions (ubuntu)      │        │  Android 手机                  │
│  ├─ npm run build:mobile      │        │  ├─ WordAtlas.apk  (~14 MB)   │
│  │   （媒体目录临时移出）      │        │  │   词库索引 + entries JSON     │
│  ├─ npx cap sync android      │  APK   │  │   WebView 壳 + Capacitor     │
│  └─ gradlew assembleDebug     │ ─────► │  └─ /Android/data/.../files/   │
└──────────────────────────────┘        │       atlas/  ← adb push 媒体包 │
                                        │         img/ thumb/ audio/      │
                                        └──────────────────────────────┘
```

- APK 内只带**词库索引**（`index.json`）和 **73 个词条 JSON 分片**（`entries/`），
  用来保证秒开。
- 图片与音频**不打包**，运行时从手机外部存储读取（OBB 模式）。
- 媒体根目录可在「我的」页切换：应用私有目录 ↔ `/sdcard/Download/word-atlas/atlas`。

## 一、在云端打出 APK

### 1.1 触发构建

1. 打开仓库 **Actions** 页签：<https://github.com/WengHosea/word-atlas/actions>
2. 左侧选择工作流 **Build Android APK**
3. 点击右侧绿色按钮 **Run workflow** → 确认分支 → 等待约 2–4 分钟

> 也可以直接 `git push` 到 `main` / `mobile` 分支，工作流会自动触发。

### 1.2 等待构建完成

![Actions 运行状态](../docs/actions-run-v20.png)

页面顶部 **Status** 变成绿色的 `Success` 即成功；红色 `Failure` 时点开失败步骤，
右侧展开日志能看到具体报错。

### 1.3 下载 APK

两条路，任选其一。

**方式 A · Releases（推荐，无需登录）**

工作流每次成功都会把 APK 挂到 Releases，链接固定格式：

```
https://github.com/WengHosea/word-atlas/releases/download/apk-debug-<运行号>/app-debug.apk
```

本次已发布的版本：**`apk-debug-20`**（对应提交 `0d37f74`）

```powershell
# 直接下载到本机
Invoke-WebRequest "https://github.com/WengHosea/word-atlas/releases/download/apk-debug-20/app-debug.apk" -OutFile D:\Downloads\app-debug.apk
```

也可以在 <https://github.com/WengHosea/word-atlas/releases> 页面点击 `app-debug.apk` 下载。

![产物下载](../docs/releases-v18.png)

![Release 详情](../docs/release-20.png)

**方式 B · Actions Artifacts**

1. 打开本次运行详情页，滚到页面底部 **Artifacts** 区域
2. 点击 **`word-atlas-debug-apk`** 下载（是个 zip，解压后就是 `app-debug.apk`）

> Artifacts 需要登录 GitHub 才有权限下载；Releases 方式不需要。

## 二、把 APK 装到手机上

> 手机上按文件名排序，最新的那个才是要装的：`app-debug-v20.apk`。
> 历史版本 `v10 / v11 / v16 / v18` 建议删掉，避免装错。

1. 手机 **设置 → 其他设置 → 开发者选项** → 打开 **USB 调试**
2. 用数据线连电脑，手机上弹出「允许 USB 调试」时点**允许**
3. 把 `app-debug.apk` 传到手机（数据线拷贝 / 微信文件传输助手均可）
4. 点击安装。首次安装会提示「未知来源应用」，按提示允许即可

也可以用 MTP 脚本直接推（无需 adb）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-apk.ps1 -Apk D:\Downloads\app-debug.apk
```

推完在手机「文件 → Download」里就能看到它，文件名带 `-v10` 后缀的是最新版。

> ⚠️ **坑**：MTP 脚本如果按目录名全局匹配 `Download`，会误命中本机的
> 「百度网盘 → AutoUpdate → Download」，文件会传到电脑上，手机里根本找不到。
> 仓库里的脚本已限定只在手机的「内部存储」下查找。

也可以直接用 adb 安装：

```powershell
adb install -r "D:\Downloads\app-debug.apk"
```

## 三、导入离线媒体包（关键步骤，约 620 MB）

媒体包在电脑上的位置：`D:\project\github\word-atlas\public\atlas\`

```
public/atlas/
├── index.json      ← 已经在 APK 里，不用管
├── entries/        ← 已经在 APK 里，不用管
├── img/            ← 7,298 张插画  (184.7 MB)  ← 要推
├── thumb/          ← 7,298 张缩略图 (69.8 MB)  ← 要推
└── audio/          ← 22,905 段音频 (366 MB)   ← 要推
```

### 3.0 免 adb 路线：打成 zip，App 自己解压（推荐给普通用户）

媒体包有 **37,576 个文件**。用 MTP / 资源管理器一个一个复制过去，实测速率只有
**4.5 个文件/秒**，全部推完要 **2 小时 40 分钟**；而单个大文件传得飞快
（100 MB 不到 2 分钟）。所以正确做法是**先压成一个 zip，再让 App 自己解压**。

**第 1 步 · 在电脑上打包**

```powershell
cd <仓库目录>
node scripts/pack-atlas-zip.mjs D:\Downloads\atlas.zip
```

输出约 **616 MB** 的 `atlas.zip`。

**第 2 步 · 把 zip 放进手机的 App 目录**

用数据线连电脑，手机上会弹出「允许访问文件」→ 选**传输文件 (MTP)**，
然后把 `atlas.zip` 复制到：

```
/内部存储/Android/data/com.haoxin.wordatlas/files/atlas.zip
```

> Windows 资源管理器默认看不到 `Android/data`，用「文件」App 或任意 MTP
> 工具都行；也可以直接用下面的命令行（Windows PowerShell）：

```powershell
# 一条命令推完（MTP 通道，无需 adb）
.\scripts\push-atlas.ps1 -Zip D:\Downloads\atlas.zip
```

**第 3 步 · 打开 App**

首次启动时 App 会自动解压 `atlas.zip` 到
`/storage/emulated/0/Android/data/com.haoxin.wordatlas/files/atlas/`，
大约需要 1–3 分钟（取决于手机存储速度）。解压完成后插画与音频即可正常显示。

也可以在 **我的 → 导入媒体包（atlas.zip）** 手动触发一次，
弹窗提示「媒体包已就绪：37,576 个文件」即成功。

> 解压完可以删掉手机里的 `atlas.zip`，释放 616 MB 空间。

**第 4 步 · 确认解压成功（可选但强烈建议）**

App 首次启动时，首页会显示一个**全屏解压进度页**，形如
`正在解压媒体包 12,000/37,576（180 MB）`。等进度条走满、页面自动跳回
首页，就说明 37,576 个文件全部落盘了。此时任意进入一个单词，
**插画**和**英/美发音**都会正常出现。

如果首页没有进度页、而是直接进了内容，说明媒体包已经是解压完成状态，
直接去任意单词页验证即可。

**万一 App 被系统杀掉 / 手动退出怎么办？**

不用重来。再次打开 App 会自动**断点续传**：已经解压好的文件会被跳过，
只补齐缺的部分。在「我的 → 离线媒体包」里可以看到当前状态。

**想确认设备端到底发生了什么？**

解压过程每一步都会写进
`Android/data/com.haoxin.wordatlas/files/diag.log`。
用数据线把手机接上电脑，直接从 MTP 通道把这个文件拷到电脑打开即可
（Windows 资源管理器看不到 `Android/data` 时，可以用仓库里的
`scripts/mphone.ps1` 之类的 MTP 脚本列目录）。

### 3.1 用 adb 一键推送（推荐）

```powershell
# 1) 创建目标目录
adb shell mkdir -p /sdcard/Android/data/com.haoxin.wordatlas/files/atlas

# 2) 推送整个媒体包（约 620 MB，视 USB 速度约 3–8 分钟）
adb push "D:\project\github\word-atlas\public\atlas\*" /sdcard/Android/data/com.haoxin.wordatlas/files/atlas/

# 3) 删掉 .nomedia 标记，否则系统媒体库会忽略该目录
adb shell "cd /sdcard/Android/data/com.haoxin.wordatlas/files/atlas && find . -name .nomedia -delete"
```

> `npm run build:mobile` 结束时会自动打印上面这三行命令，可直接复制。

### 3.2 不用 adb 的替代方案（逐文件复制，较慢）

手机连接 Wi-Fi 后，用「文件管理 → 电脑 → SMB」或数据线把整个 `public/atlas`
文件夹复制到：

```
/storage/emulated/0/Android/data/com.haoxin.wordatlas/files/atlas/
```

复制完成后打开 App，进入 **我的 → 媒体包路径**，确认显示为
`/storage/emulated/0/Android/data/com.haoxin.wordatlas/files/atlas`。

> 注意：Android 11+ 的系统文件管理器通常不允许写入 `Android/data` 子目录。
> 若无法写入，请改用 3.1 的 adb 方式，或把包放到
> `/sdcard/Download/word-atlas/atlas` 再在「我的」页切换媒体根路径
> （Android 10 及以下无需额外授权；11+ 需要手动授予「所有文件访问权限」）。

## 四、验证安装

1. 打开 **WordAtlas**，首屏应直接进入「今日计划」卡片流（不会加载耗电的 WebGL 星图）
2. 任意进入一个单词：**插画**与**英/美发音**应正常显示与播放
3. 进入 **我的** 页面，底部「媒体包路径」应显示当前路径与状态
4. 底部 **FSRS 评分条**（Again / Hard / Good / Easy）应固定在屏幕拇指热区

若插画显示占位图、顶部弹出「未检测到离线媒体包」，
说明媒体包路径不对，回到「我的」页切换媒体根路径，或重新执行 3.1。

### 4.1 装好之后应该长这样

今日计划页（插画卡片 + 发音按钮都在）：

![今日计划](../docs/app-today-mobile.jpg)

单词详情页（插画 + 英/美两个发音按钮 + 例句）：

![单词详情](../docs/app-word-mobile.jpg)

如果这两个页面的插画位置是空白或灰色占位块、点喇叭没声音，
那就是媒体包没解压完，回到 3.0 的第 3 步重开 App 让它续传。

### 4.2 三种状态，秒判是不是装好了

| App 表现 | 含义 | 该做什么 |
| --- | --- | --- |
| 启动时出现全屏进度页 `正在解压媒体包 12,000/37,576` | 正在解压，等它走完 | 什么都不用做，耐心等几分钟 |
| 启动时直接进首页，单词页有图有声 | 一切正常 | — |
| 启动时直接进首页，但单词页没图没声 | 媒体包缺失或没解压完 | 确认 `atlas.zip` 在 `Download/` 或 App 私有目录，然后重开 App |

### 4.3 用 `diag.log` 确证（不用 adb）

App 每次启动都会把版本号、剩余空间、找到/没找到 `atlas.zip`、解压了多少文件
写进 `Android/data/com.haoxin.wordatlas/files/diag.log`。

用数据线连电脑，把手机接成 MTP 模式，然后用仓库里的 MTP 脚本列目录：

```powershell
# 列出 App 私有目录里的文件
pwsh -File scripts\mphone.ps1 -PhonePath "内部存储/Android/data/com.haoxin.wordatlas/files"
```

看到 `diag.log` 就说明**新版 App 确实启动过**（旧版根本不写这个文件）；
看不到就说明手机上跑的还是旧 APK，需要重新安装。

`diag.log` 里出现这几行分别代表：

```
=== app start (sdk=33 version=1.0) ===   ← 新版启动
free space = 8123456789 bytes            ← 剩余空间
unpacking /sdcard/.../atlas.zip (646090503 bytes)
  progress 5000/37576 (85 MB)            ← 解压进度
unpack finished: files=37576 written=37576 ... ready=true
```

看到 `NO PACK FOUND` 就说明 `atlas.zip` 没放到 App 能看到的位置。

## 五、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 弹出「未检测到离线媒体包」 | 媒体没推全或路径不对，检查「我的 → 媒体包路径」 |
| 有插画没声音 | `audio/` 没推全，重新 push 该目录 |
| `adb push` 报 `Permission denied` | 目标目录不存在，先执行 `adb shell mkdir -p ...` |
| `adb push` 报 `device unauthorized` | 手机上「允许 USB 调试」的弹窗没点，或先 `adb kill-server` |
| 想改用下载目录 | 把包放到 `/sdcard/Download/word-atlas/atlas`，然后在「我的」页切换 |
| 想恢复进度 | 「我的 → 从本地沙盒恢复备份」，读取 `progress-backup.json` |

### 5.1 云端构建踩过的坑（已修复，仅供维护参考）

| 报错 | 根因 | 修复 |
| --- | --- | --- |
| `Warning: Failed to find package 'tools'` | `android-actions/setup-android@v3` 会执行已被下线的 `sdkmanager tools` | 弃用该 action，直接用 runner 预装的 `sdkmanager` 装 `platforms;android-36` / `build-tools` |
| `The Capacitor CLI requires NodeJS >=22.0.0` | Capacitor CLI 8 强制 Node ≥ 22，原方案的 Node 20 不满足 | 工作流改用 Node 22 |
| `error: invalid source release: 21` | Capacitor 8 的 android 库以 source/target 21 编译，JDK 17 不够 | 改用 Temurin JDK 21，并在 `app/build.gradle` 显式声明 `JavaVersion.VERSION_21` |
| `./gradlew: Permission denied` | git 在 Windows 上检出时丢了可执行位 | 构建步骤先 `chmod +x gradlew` |
| `gh: Resource not accessible by integration` | 默认 `GITHUB_TOKEN` 没有 `contents: write`，无法建 Release | 在 job 上加 `permissions: contents: write` |

### 5.2 媒体包反复丢失 / 换版后没图没声（已修复）

| 现象 | 根因 | 修复 |
| --- | --- | --- |
| 装完新版 APK 后 App 里图和声音全没了 | 每次 CI 构建的 debug 签名都不同，Android 判定为「另一个应用」→ 卸载旧版 → **连同 `files/` 里的媒体包一起清空** | 仓库内置固定 debug keystore（`android-debug.keystore`），`build.gradle` 里 `signingConfigs.debugFixed` 固定签名。以后升级不再清数据 |
| 第一次启动 App 卡住不动 / ANR | 解压 37,576 个文件跑在 UI 线程上 | `MediaPackPlugin` 改用单线程 `ExecutorService` 解压，主线程只负责通知前端 |
| 升级后又找不到 `atlas.zip` | 媒体包放在应用私有目录，重装即被清空 | 插件按顺序查找：应用私有目录 → `Download/word-atlas/` → `Download/`；媒体包放在 `Download` 下可以跨版本存活 |

> 提示：即使现在签名固定了，也建议把 `atlas.zip` 放在
> `内部存储/Download/word-atlas/atlas.zip`。这样以后随便重装 App 都不用再推 616 MB。

### 5.3 云端构建踩过的坑（补充）

| 报错 | 根因 | 修复 |
| --- | --- | --- |
| `error: cannot find symbol ... DIRECTORY_DOWNLOAD` | android-36 的 stub jar 里没有暴露 `Environment.DIRECTORY_DOWNLOAD` 常量 | 改用字面量 `"Download"` |
| `signingConfigs.debugFixed` 找不到 | `signingConfigs` 块声明在 `buildTypes` 之后，Gradle 求值时还没建好 | 把 `signingConfigs` 移到 `buildTypes` 之前 |
| CI 里找不到 keystore | 仓库用了 sparse-checkout，`android/app/` 下的二进制文件没被检出 | keystore 挪到仓库根目录 `android-debug.keystore`，并加了显式校验步骤 |

### 5.4 装完新版还是「没图没声」（已修复）

| 现象 | 根因 | 修复 |
| --- | --- | --- |
| 解压到一半 App 被系统杀掉，之后再打开永远「没图没声」 | 旧代码用 `index.json` 判断「媒体包是否就绪」。但 `index.json` 是压缩包里的**第 2 个条目**，解压刚开始它就落盘了。于是中断的解压被误判成「已完成」，App 从此再也不会解压剩下的 37,574 个文件 | 新增 `AtlasExtractor`，全部文件解完才写 `.atlas-ready` 标记文件；就绪判定只看这个标记 |
| 解压中断后必须从头再来 | 旧代码每次都重写所有文件 | `AtlasExtractor` 会跳过已存在且大小一致的文件，**断点续传**。中途退出后再打开 App 会接着上次继续 |
| App 启动后毫无反应，不知道在干嘛 | 解压状态没有暴露给前端 | 插件把进度写进 `files/diag.log`（手机可用 MTP 直接读取），前端启动时显示解压进度页 |

**排查手机上的真实日志**（不需要 adb）：把手机上的
`Android/data/com.haoxin.wordatlas/files/diag.log` 拉到电脑上，就能看到 App
启动后的每一步：有没有找到 `atlas.zip`、解了多少个文件、有没有异常堆栈。

**手动重置媒体包状态**（只在确认要重新解压时用）：删掉
`Android/data/com.haoxin.wordatlas/files/atlas/` 目录下的 `.atlas-ready`
文件，App 下次启动就会重新解压（已解出的文件会跳过，所以只会补齐缺的部分）。

### 5.5 build 20：加装了「版本印记」和空间检查

排查「装完还是没图没声」时，最难的是分不清**手机里跑的是哪一版**。
build 20 起，App 每次启动都会：

| 文件 | 作用 |
| --- | --- |
| `files/version.txt` | 记录 SDK 版本、versionName、启动时间戳 —— 证明**新版真的被打开过** |
| `files/diag.log` | 追加版启动横幅、剩余空间、找到的包路径、解压进度、完成标记 |

`diag.log` 的启动横幅长这样：

```
=== app start (sdk=33 version=1.0) ===
free space = 8123456789 bytes
```

只要 `version.txt` 存在，就说明手机上是 build 20 或更新的版本；
如果它不存在，而用户坚称装了最新，那就是**装错了包**
（文件名带 `-v10/-v11/-v16/-v18/-v20` 后缀的是历史版本，最新的是 `-v20`）。

另外 build 20 会在解压前检查剩余空间：

```
WARNING: not enough free space (123456789 bytes) for a 646090503 byte archive
```

媒体包解压后约 660 MB，加上 zip 本身，**手机上需要留出至少 1.4 GB**。
空间不足时解压会中途失败，这是「有词条、没图没声」的另一个常见原因。

### 5.6 一句话排查流程

1. 手机 `Download/` 里有没有 `app-debug-v20.apk`？（最新）
2. `Android/data/com.haoxin.wordatlas/files/` 里有没有 `version.txt`？
   - 没有 → 装的是旧包，去装 `-v20`
   - 有 → 继续
3. 有没有 `diag.log`？打开看 `NO PACK FOUND` 还是 `unpacking ...`
   - `NO PACK FOUND` → `atlas.zip` 位置不对，放到 `Download/` 或 App 私有目录
   - `unpacking` → 等它解完，或中途被杀（下次启动会自动续传）
   - `unpack finished ... ready=true` → 包没问题，检查「我的」页的媒体根路径
4. 手机剩余空间 ≥ 1.4 GB？

## 六、后续可做的增强

- **Release 签名包**：在仓库 Secrets 里配置 `ANDROID_KEYSTORE_BASE64` /
  `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`，
  然后放开工作流中被注释的 `assembleRelease` 步骤。
- **换包名**：改 `capacitor.config.ts` 的 `appId` 与
  `android/app/src/main/java/com/haoxin/wordatlas/MainActivity.java` 的包路径，
  再 `npx cap sync android`。
- **免 adb 导入（已实现）**：App 内置 `MediaPackPlugin`，启动时自动检测并解压
  App 私有目录下的 `atlas.zip`；也可在「我的 → 导入媒体包（atlas.zip）」手动触发。
