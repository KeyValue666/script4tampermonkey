# 哔哩哔哩 · 首页增强与视频工具

> 隐藏 B 站首页轮播，让推荐视频排成 2 行 × 5 列；Alt + R 一键旋转竖屏视频；一键导出视频的整条音轨。

| 项 | 内容 |
| --- | --- |
| 脚本文件 | [bilibili-com.user.js](./bilibili-com.user.js) |
| 当前版本 | `2.2.2` |
| 适配域名 | `https://www.bilibili.com/*`、`https://t.bilibili.com/*` |
| 脚本管理器 | Tampermonkey 5.x / Violentmonkey 2.x |
| 安装 | [点击安装](https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/bilibili-com/bilibili-com.user.js) |

## 功能

- **首页推荐 2 行 × 5 列**：隐藏首页顶部的轮播图，右侧 10 张推荐卡片自动回填为 2 行 × 5 列。
- **Alt + R 旋转视频**：对当前视频应用 `rotate(-90deg) scale(1.78)`，再按一次恢复，用来播放被压成竖屏的 PC 端稿件。
- **可拖拽面板**：页面右上角悬浮，拖动标题栏换位置，`×` 隐藏；隐藏后右下角出现小电视吉祥物图标按钮可再次打开。所有开关即时生效并自动保存。
- **提取视频音频**：在视频页点「提取音频」，脚本从页面内嵌的播放信息里取出独立音轨直链，一次下载整段 `m4a / AAC` 文件。秒级完成、原始码率无损、不需要播放，也不实时录音。

## 使用说明

1. 安装脚本后打开 `https://www.bilibili.com/`，页面右上角会出现「B站个性化增强」面板。
2. 勾选「首页推荐 2 行 × 5 列」：轮播图消失，推荐卡片排成 2 行 × 5 列；取消勾选立即还原。
3. 播放视频时按 `Alt + R` 旋转，再按一次恢复；在输入框里按不会触发。
4. 拖动标题栏可移动面板；点 `×` 隐藏面板。
5. 在视频页点「提取音频」：按钮变成「提取中…」，几秒内自动下载 `视频标题.m4a`（文件名与视频标题一致），无需播放视频、无需等待时长。
6. 想要 mp3：浏览器本身编不了 mp3，用本地 ffmpeg 转一次，命令见「已知限制」。
7. 面板位置与开关保存在浏览器本地，下次打开仍生效。

## 触发条件与覆盖页面

| 页面 | 是否生效 | 说明 |
| --- | --- | --- |
| `https://www.bilibili.com/` | ✅ | 面板 + 首页 2 × 5 |
| `https://www.bilibili.com/video/BV...` | ✅ | 面板 + Alt + R 旋转 + 音频提取 |
| `https://www.bilibili.com/bangumi/...` | ✅ | 面板 + 旋转 + 音频提取 |
| `https://t.bilibili.com/` | ✅ | 面板 + 旋转，无首页网格 |
| 其它站点 | ❌ | 未在 `@match` 内 |

## 权限与隐私

| 项 | 内容 |
| --- | --- |
| `@grant` | `none`，不使用任何 GM API |
| `@connect` | 无，音轨直链用页面原生 `fetch` 请求，不走 GM 跨域 API |
| 读取的数据 | 页面上的轮播是否存在、推荐卡片数量（本地布局）；页面内嵌的 `window.__playinfo__` 里的音轨直链 |
| 发出的请求 | 仅两条：向 B 站 CDN 下载音轨；页面无内嵌音轨时向 `api.bilibili.com/x/player/playurl` 查询公开播放地址（带当前账号态，不伪造） |
| 上传的数据 | 无；音轨只通过浏览器下载落到本地磁盘 |
| 本地存储 | `localStorage` 键 `s4tm:bilibili-com:settings`，只存面板位置与两个开关 |
| 麦克风 / 摄像头 | 完全不访问，浏览器不会弹出设备授权 |

## 已知限制

- **站点改版即停用**：首页逻辑依赖「轮播向上 4 层内、`display` 为 grid/flex、且直接子元素至少有 4 个卡片的容器」。结构不符时脚本什么都不做（而不是乱改布局），需要按「开发说明」更新选择器。
- **列数跟随站点**：2 × 5 依赖站点自身的 5 列网格（`245px × 5`）；窗口更窄或站点改列数时会变成 4 列或更少。
- **卡片高度不齐**：个别卡片标题两行、高度略高，同一行顶部对齐但底部可能不齐。
- **旋转只改视频元素**：不改变播放器容器尺寸，网页全屏 / 全屏场景下可能表现不同，必要时再按一次恢复。
- **首页有约 0.3 秒延迟**：B 站首屏会重绘推荐区，脚本等页面稳定后才应用布局，避免抖动。
- **导出的是 m4a，不是 mp3**：B 站音轨是 AAC / fMP4，浏览器没有任何 MP3 编码器（`MediaRecorder` 只给 opus / AAC，WebCodecs 也没有 mp3 编码器）。把 AAC 文件改名成 `.mp3` 只会得到坏文件，所以脚本如实导出 `.m4a`。要 mp3 就用 ffmpeg 转一次，音质不变（有损转码一次，可提高 `-b:a 320k`）：
  ```bash
  ffmpeg -i "视频标题.m4a" -codec:a libmp3lame -b:a 320k "视频标题.mp3"
  ```
- **CDN 防盗链可能导致 403**：脚本会依次尝试主直链与最多两个备用直链；仍失败时提示「提取失败」。刷新页面重新获取直链后重试即可。
- **旧格式（durl）稿件**：页面没有内嵌 DASH 音轨时，脚本会向官方 `playurl` 接口补查；查不到就只提示，不报错。
- **只拿当前账号有权播放的音轨**：不伪造登录态、不绕过会员校验、不解析签名；直链过期就刷新页面重取。
- **禁用脚本后需刷新页面**：油猴禁用脚本时不会通知已注入实例，脚本无法自动卸载。所有资源已集中登记，调试时把 `CONFIG.debug` 改为 `true` 后可在控制台执行 `__S4TM__.destroy()` 主动还原；普通用户刷新一次页面即可彻底回收。

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。

## 开发说明

### 真实结构（2026-10 实机测量，1600px 宽）

```text
.recommended-container_floor-aside
└─ .container.is-version8        display:grid; grid-template-columns: 245px × 5; gap 20px
   ├─ .recommended-swipe          轮播，显式 grid-row: 1/3、grid-column: 1/3（占 2 列 × 2 行）
   ├─ .feed-card × 10             推荐视频卡片：前 6 张在轮播右侧，后 4 张原本在下一行
   └─ .floor-single-card、.bili-video-card、.load-more-anchor …
```

### 实现方式（1.0.2）

容器本来就是 5 列网格，只是被轮播占了 2 列。脚本只做两件事：

1. 给 `.recommended-swipe` 设 `display: none !important`，让它退出网格；
2. 给容器加 `data-s4tm-home`，用 CSS 把容器内 `.feed-card` 的 `margin-top` 清零 —— 第 7–10 张卡片自带 40px 楼层间距，轮播消失后它们进入第二行会被压低 40px，看起来像两行错位。

轮播退出后，10 张 `.feed-card` 由浏览器自动回填成 2 行 × 5 列；不插入任何卡片，也不修改容器的布局属性。

### 为什么删掉了 1.0.0 / 1.0.1 的写法

那两版按「整页视频卡片的公共祖先」推断网格，并向网格注入轮播卡片。B 站首页是服务端渲染 + 客户端重绘，几秒后推荐流、广告、分区的卡片陆续挂载，公共祖先一路上移，最终 `display: grid` 被加到接近整页的容器上，出现「静默几秒后排版错乱」；同时容器选择器 `.bili-grid` 在当前版本已经不存在，功能实际从未生效。

### 音频提取实现（2.2.1）

B 站视频页内嵌 `window.__playinfo__`，其中 `data.dash.audio` 是与画面分离的**完整音轨**：AAC 编码、fMP4 容器，`baseUrl` 一个地址就是整段音频（含初始化段与索引段）。所以直接下载即可，不需要播放、不需要录制、不需要拼接分片。

1. `readPageObject()` 先读 `window.__playinfo__`；脚本若运行在隔离世界读不到页面全局变量，就扫描内联 `script`，用括号配平截出 JSON 再 `JSON.parse`。`__INITIAL_STATE__` 用同一套逻辑取 `cid`。
2. `pickAudioTrack()` 从 `dash.audio`（必要时含 `dash.dolby.audio`）里挑码率最高的 AAC 轨，跳过杜比 / FLAC 这类塞不进 m4a 的编码。
3. 页面只有 `durl`（旧格式）时，`requestDashAudio()` 用 `bvid + cid` 查一次公开的 `api.bilibili.com/x/player/playurl?fnval=16`，拿到 dash 音轨；查不到就降级提示。
4. `fetchAudioBlob()` 依次尝试 `baseUrl` / `backupUrl`（最多 3 个），每个请求独立 `AbortController` + 30 秒超时；全部失败才抛错。
5. `getVideoTitle()` 按「`__INITIAL_STATE__.videoData.title` → 标题 DOM → 清洗 `document.title`」取视频名，经 `sanitizeFileName()` 去掉非法字符后直接作为文件名（`视频标题.m4a`）；下载用 `Blob` + `a[download]`，3 秒后 `revokeObjectURL`（句柄登记在 `runtime`，卸载时可提前释放）。请求期间按钮置灰防重复点击。

**为什么不直接出 mp3**：浏览器没有 MP3 编码器，且本项目禁止引入外部依赖 / CDN / WASM 转码库。硬改扩展名只会产出无法播放的假 mp3，因此输出保持原始 AAC 容器；转 mp3 交给本地 ffmpeg（命令见「已知限制」）。

### 资源回收（2.2.2）

所有监听器、观察者、定时器、`AbortController` 与 objectURL 统一登记在 `runtime`，`destroy()` 一次性回收；`init()` 与 `startLayoutWatcher()` 都有幂等标记，重复注入不叠加。首页布局与视频旋转持有的 DOM 引用在节点脱离文档时立即断开。拖动面板只在 `pointerdown` 时读一次尺寸，位置写入合并到 `requestAnimationFrame`。音轨直链只校验 HTTPS 与「非裸 IP / 非内网」，不设 CDN 域白名单——B 站 CDN 域随调度变化，硬白名单会误伤正常下载。

### 选择器依赖

| 用途 | 选择器 | 说明 |
| --- | --- | --- |
| 轮播 | `.recommended-swipe` | 兜底 `[class*="recommended-swipe"]` |
| 推荐容器 | 轮播向上 4 层内、`display` 为 grid/flex、直接子元素至少 4 个卡片的祖先 | 实测命中 `.container.is-version8` |
| 推荐卡片 | `.feed-card`、`.bili-video-card` | 只用于计数与间距修正 |
| 视频链接 | `a[href*="/video/"]` | 确认找到的确实是轮播 |

### 易碎假设

- 首页推荐区仍是「5 列网格 + 10 张 `.feed-card`」。若 B 站改成 4 列或卡片数量变化，会按站点列数排列，可能不再严格 2 × 5。
- 第 7 张之后的卡片仍带楼层间距（脚本清零的是 `margin-top`；若 B 站改用 `padding` 或额外包裹层，需要同步调整）。
- 音频提取依赖页面内嵌 `window.__playinfo__.data.dash.audio` 及 `baseUrl` / `backupUrl` 字段。若 B 站改为纯接口下发播放信息、去掉内嵌对象，脚本会走 `playurl` 兜底；若连 `cid` 都取不到，就只提示不工作，需要同步调整 `readPageObject()` 的取值路径。
- 音轨直链带时效签名，长时间停在页面上再点提取可能遇到 403，刷新页面即可重取。

### 回归验证

1. 打开首页，确认轮播消失，推荐区第一、二行各 5 张卡片，同行顶部对齐。
2. 等 10–20 秒（B 站重绘期），确认布局不跳变、不出现整页网格化。
3. 点「换一换」刷新推荐，确认仍是 2 行 × 5 列。
4. 取消勾选「首页推荐 2 行 × 5 列」，确认轮播恢复、卡片回到 3 + 3 + 4 排列。
5. 视频页按 `Alt + R` 旋转，再按恢复；在搜索框里按不应触发。
6. 视频页点「提取音频」：几秒内下载的文件名应与页面视频标题一致（例如 `【4K】测试视频.m4a`），用播放器打开能听到完整声音、时长与稿件一致；按钮恢复「提取音频」。
7. 首页点「提取音频」：应提示「没找到独立音轨」或类似降级文案，Console 不报错、页面无异常。
8. 用 DevTools 屏蔽主直链（模拟 403）：应自动尝试备用地址，或给出「提取失败」提示，不抛未捕获异常。
9. 提取过程中反复点击按钮：按钮置灰，只触发一次下载。
