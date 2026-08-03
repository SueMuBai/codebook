# 密语（codebook）v1.1 优化计划

> **文档状态：** v1.1 优化执行计划
> **创建日期：** 2026-07-31
> **前置状态：** v1 功能完整（6 位主 PIN、生物识别解锁、滚动修复、生物识别引导均已合入 main）
> **目标：** 在不改变产品范围的前提下，优化框架质量、补全交互闭环、修复 UI 细节。

## 0. 背景与验收总则

v1 功能闭环已完成，但存在三类欠账：

1. **框架层**：相同逻辑（PIN 输入规整、错误码提取、危险确认弹窗、密码框模板）在 3–4 个视图中重复实现，样式类三套并存，后续维护成本高。
2. **交互层**：部分状态反馈缺失或含义不清（空值仍显示操作按钮、"尚未记录"歧义、页内返回在深链场景会退出应用）、长表单压迫感强。
3. **UI 细节层**：用户明确报告"按钮文本不居中"等问题，已定位若干实锤（见 §3）。

**总验收门槛（每阶段完成后必须全绿）：**

- `npm run typecheck`、`npm run lint`、`npm run test` 全部通过；
- 浏览器 390×733 视口下走通核心路径：创建保险箱 → 新建条目 → 详情复制 → 设置调整 → 锁定 → 解锁；
- 完成后 `npm run build && npx cap sync android` 并重新打 APK。

## 1. 阶段一：框架优化

> 原则：只消除已经造成三处以上重复、或已产生真实 bug 的抽象缺口；不做投机性重构。

| 编号 | 问题 | 方案 | 涉及文件 |
|---|---|---|---|
| F1 | 生物识别错误码提取逻辑重复 4 处（`error && typeof error === 'object' && 'code' in error …`） | 新增 `src/utils/errorCode.ts` 导出 `extractErrorCode(error): string`，四处改为调用 | LockView.vue、stores/session.ts、SettingsView.vue、services/secure/biometricOffer.ts |
| F2 | PIN 输入框实现重复：normalize watch × 6 个、"输入框+眼睛按钮"模板 × 6 处、配套 CSS 三套（`.password-field` / `.password-control` / `.field-with-icon`） | 新增 `src/components/ui/PinField.vue`（v-model、label、placeholder、autocomplete、pin 模式内建 normalize 与显隐切换、左侧图标可配），三个视图全部替换；删除三套重复 CSS | OnboardingView.vue、LockView.vue、MasterPasswordView.vue |
| F3 | 危险确认弹窗硬编码色值 `#e11d48` × 4 处，不随主题 | 新增 `src/services/ui/dialogs.ts` 导出 `confirmDanger({title, message, confirmText})` 统一封装 | LockView.vue、SettingsView.vue、CategoriesView.vue |
| F4 | 页内返回按钮直接 `router.back()`，从锁屏 redirect 深链进入二级页时返回会退出到锁屏 | 新增 `src/services/navigation/goBack.ts`：`goBackOr(fallback)` —— 有同源历史则 back，否则 `replace(fallback)`；所有 `page-back` 按钮改用 | EntryDetailView.vue、EntryEditView.vue、CategoriesView.vue、ImportExportView.vue、MasterPasswordView.vue |

**不做（评估后收益不足）：** setInterval 自动锁定轮询改事件驱动；`cloneEntry` 换 `structuredClone`；stores 进一步拆分。

## 2. 阶段二：交互逻辑补全与排版结构

| 编号 | 问题 | 方案 | 涉及文件 |
|---|---|---|---|
| I1 | 详情页空值字段（网址/账号/密码为空）仍显示禁用按钮，禁用态视觉区分弱，用户以为可点 | 空值时隐藏对应操作按钮，字段值展示"未填写"弱化样式；网址行无值时整行不再渲染"打开" | EntryDetailView.vue |
| I2 | "尚未记录"（lastUsedAt 为空）含义不明 | 文案改为"从未使用"；有值时保持本地化时间 | EntryDetailView.vue |
| I3 | 编辑页 2FA 段落把"扫码 / URI / 手工"三种添加方式全部平铺，表单超长 | "粘贴 URI"与"手工添加"两张 method-card 默认折叠为按钮，点击展开对应表单（本地 ref 控制，不引入新依赖） | EntryEditView.vue |
| I4 | 新建/编辑条目保存时标题为空只靠 store 抛错，报错时机晚且提示来自底层 | 提交前视图层校验：标题为空 → toast "请填写标题" 并聚焦标题框 | EntryEditView.vue |
| I5 | 分类保存按钮无 busy 态，连点可触发重复提交 | `saving` ref + 按钮 disabled + 文案切换 | CategoriesView.vue |
| I6 | 锁定后重新解锁，保险箱列表 keep-alive 残留上次搜索词与筛选，易误以为数据丢失 | session `lock()` 时广播；VaultListView 在 `onActivated` 检测锁定周期变化后重置 query/筛选 | stores/session.ts、VaultListView.vue |

**排版结构（与交互合并执行）：**

| 编号 | 问题 | 方案 |
|---|---|---|
| L1 | 编辑页 sticky 头部与页面滚动容器、安全区耦合，真机停靠时可能上方漏内容 | 页面统一改用原生文档滚动；sticky 头部使用 `top: var(--safe-top)`，不再依赖负偏移 |
| L2 | 二级页大标题（text-xl 28px）+ 副标题在 360px 下与返回按钮基线不齐 | page-header 统一 `align-items: center`，标题行高微调 |

## 3. 阶段三：UI 细节修复

| 编号 | 问题（已实测确认） | 方案 | 涉及文件 |
|---|---|---|---|
| U1 | **保险箱页右上"+"按钮图标偏左 8px**：小屏用 `font-size:0` 隐藏文本，但文本节点仍占 flex gap | 该断点下补 `gap:0`（或文本包 span 并 `display:none`） | VaultListView.vue:117 |
| U2 | 按钮文本垂直偏移 ±1px（line-height 舍入），Android 中文字体下更明显 | `.btn-primary/.btn-ghost/.btn-danger/.chip/.status-pill` 统一补 `line-height:1` | styles/layout.css |
| U3 | 原生 checkbox（收藏条目、遮罩显示）与整体设计语言脱节 | 换成纯 CSS 开关样式（复用 accent 色、44px 触控目标），不引组件库 | EntryEditView.vue |
| U4 | 原生 select 系统箭头样式不统一 | `.select` 统一 `appearance:none` + 内嵌 SVG 箭头背景 + 右 padding | styles/layout.css |
| U5 | `.mono` 输入框的中文 placeholder 字距异常（monospace + letter-spacing） | `.input.mono::placeholder { font-family: var(--font-family); letter-spacing: normal }` | styles/layout.css |
| U6 | 分类列表色点光环用 `currentColor`，实际取的是文字色而非分类色 | `.category-dot` 的 `color` 设为分类色（style 绑定处同时设 background 与 color） | CategoriesView.vue:117 |
| U7 | 浅色主题下 vant toast 为"浅底白字"，对比不足 | vant-theme.css 补 `--van-toast-text-color` 并按主题适配 | styles/vant-theme.css |
| U8 | `--font-family` 首选 Inter 但项目未打包该字体，装了 Inter 的桌面与 Android 渲染不一致 | 移除 Inter，以系统栈（system-ui/PingFang/MiSans/Noto）为准 | styles/tokens.css |
| U9 | 详情页禁用按钮透明度 .46 与可用态区分不够（与 I1 联动） | I1 隐藏后遗留场景统一 disabled 样式（降饱和+去阴影） | styles/layout.css |
| U10 | 新建条目“保存”文字与左侧图标作为整体居中，导致文字中心右偏约 13px | 图标绝对定位，文字使用独立 span 按按钮边界居中；移动端保留足够宽度避免“保存中”重叠 | EntryEditView.vue |

## 4. 执行顺序与提交策略

1. 阶段一（F1–F4）→ 全量验证 → 提交 `refactor: extract shared pin field, error code, danger dialog, safe back`
2. 阶段二（I1–I6、L1–L2）→ 全量验证 + 截图对比 → 提交 `feat: complete interaction feedback and form structure`
3. 阶段三（U1–U9）→ 全量验证 + 浅/深主题截图 → 提交 `fix: button centering, native control styling, typography details`
4. `npm run build && npx cap sync android` → Windows gradle `assembleDebug` 出 APK → 推送 main 触发 CI。

## 5. 风险与回滚

- PinField 组件化涉及三个鉴权视图，属加密入口路径，替换后必须重走：创建 → 锁定 → PIN 解锁 → 修改 PIN → 再解锁。
- keep-alive 重置（I6）不得误伤"进详情返回保留搜索词"这一合理行为，仅在锁定周期变化时重置。
- 所有样式改动不引入新依赖、不改设计令牌语义；出现回归以单条 revert 处理。
