# 彩果 App 架构与设计思路

> 用途说明：本文档从「彩果·体彩长期账单」项目中提炼架构模式与设计思路，
> 目的是让读者能够仿照同样的架构，快速搭建一个新的 Vue 3 + Capacitor 移动端应用。
> 结构按「顶层 → 领域/数据 → 业务 → UI → 基础设施与质量」展开，共 13 节 + 附录。
> 每节尽量覆盖「是什么」「为什么这样设计」「仿造时怎么用」。
>
> 校验说明：下文接口与文件名已按当前仓库源码校对（v2.0.15）。
> 部分代码块为教学节选，不等同于完整源文件。

---

## 1. 顶层架构

### 1.1 概览

```
┌─────────────────────────────────────────────────┐
│                   UI Layer                       │
│  Vue 3 + Vant 4 + 自建设计系统 (AppComponent)    │
│  Views (页面) → Components (业务组件/通用组件)   │
├─────────────────────────────────────────────────┤
│               State / Store Layer                │
│  Pinia (ticket / ledger / plans / settings)      │
│  只放「状态」和「上下文」，不放「计算逻辑」      │
├─────────────────────────────────────────────────┤
│              Domain / Feature Layer              │
│  features/betting/  投注计算内核                  │
│  features/matches/  比赛/赛果标准化              │
│  features/plans/    方案规则                     │
│  features/ledger/   账单调整                     │
│  features/settings/ 参数校验                     │
│  features/sync/     同步协调                     │
├─────────────────────────────────────────────────┤
│               Service Layer                      │
│  services/api/        HTTP 客户端 + 网关封装     │
│  services/database/  数据库适配器 (双端实现)      │
│  services/export/    导出                        │
├─────────────────────────────────────────────────┤
│           Infrastructure / Platform              │
│  Capacitor 7 / SQLite / IndexedDB               │
│  Vite 7 / TypeScript / Vitest                   │
│  视口验收：Playwright（工程外/验收用，非 npm 依赖） │
└─────────────────────────────────────────────────┘
```

### 1.2 核心决策

| 决策 | 选型 | 理由 |
|---|---|---|
| 框架 | Vue 3 + TypeScript | 稳定、生态成熟、Capacitor 首选 |
| UI 组件库 | Vant 4 | 移动端优先、不引入 Tailwind 的原子类叠加 |
| 状态管理 | Pinia | 轻量、TypeScript 友好、无 mutation 噪音 |
| 路由 | Vue Router (Hash 模式) | Capacitor 文件协议不支持 history 模式 |
| App 容器 | Capacitor 7 | Web → 原生桥接，统一 JS 逻辑 |
| 数据层 | 适配器模式 (Adapter Pattern) | 同一领域模型跑 Android SQLite 和浏览器 IndexedDB |
| 构建 | Vite 7 | 快、原生 ESM、测试内置（Vitest） |
| 金额 | 整数分 (cents) + `utils/money.ts` | 杜绝浮点误差 |
| 视口验收 | Playwright 脚本 / 人工三档检查 | 不绑进 `package.json` 日常测试；证据在 `output/playwright/` |

### 1.3 仿造要点

- **不要在一开始就想着全平台**。适配器模式让你先跑通浏览器，再上真机。
- **Hash 路由**是 Capacitor 的必要选择，不是可选项。
- **Pinia 优于 Vuex**——少写很多样板。
- **Vant 做通用组件，自建组件做品牌**，不追求定制到每个 button 都手写。

---

## 2. 目录结构与模块划分

```
src/
  app/            # App 级初始化
    router.ts        路由定义
    lifecycle.ts     原生生命周期（返回键、遮罩管理）
    version.ts       版本号

  main.ts         # 入口：Pinia + Router + Vant + nativeLifecycle

  types/          # 全局领域类型
    domain.ts        所有实体接口、常量

  services/       # 基础设施服务
    api/             网络请求、网关封装
    database/        数据库适配器接口 + 双端实现 + 备份
    export/          导出能力
    migration/       历史遗留空目录（旧迁移代码已删除）

  features/       # 业务域（feature-based）
    betting/         计算内核（纯函数、无状态）
    matches/         比赛类型 + 持久化校验
    plans/           方案名称、标签、详情展示、持久化校验
    ledger/          账单调整规则、展示
    settings/        系统参数校验
    sync/            同步协调服务（SyncService）

  stores/         # Pinia Store
    ticket.ts        → useTicketStore
    ledger.ts        → useLedgerStore
    plans.ts         → usePlanStore   （注意：单数 Plan）
    settings.ts      → useSettingsStore

  components/     # 组件
    base/            设计系统基础组件
    ticket/          选票业务组件
    ledger/          账单业务组件
    plans/           方案业务组件

  views/          # 页面（一级路由 + 二级页）
    TicketView.vue / CurrentTicketView.vue
    LedgerView.vue / LedgerDetailView.vue
    PlanManagerView.vue / PlanDetailView.vue / ...
    SettingsView.vue / settings/*

  styles/         # 样式
    index.css         入口：按序 import 下列文件
    tokens.css        设计令牌
    reset.css         层叠重置
    typography.css    字体
    layout.css        安全区、页面容器
    vant-theme.css    Vant 主题变量覆盖

  utils/
    money.ts          元 ↔ 分转换、分合计

  assets/
    ui/               运行时切图（按模块分类）
      common/  ticket/  ledger/  plans/  settings/  date/  theme/
    icons/navigation/ 底部导航默认/选中 SVG（6 个）
```

### 2.1 设计原则

1. **feature 目录不含 UI**。每个 feature 只导出纯函数、类型和校验器，UI 在 components 和 views 中按需引用。
2. **Store 尽量不调 Store。** 目标形态是各自经 `getDatabase()` / `getSyncService()` 读写。当前唯一例外：`usePlanStore` 在「载入方案到选票」时调用 `useTicketStore().loadPlan(...)`（见 §7.2）。新项目应优先把跨领域动作放到页面或应用服务，而不是互相 import store。
3. **组件分两层**：`base/` 是通用设计系统（Button、Card、Sheet、Chip），不感知业务；`ticket/` 等是业务组件，参与具体数据展示。
4. **页面是胶水层。** 只组装 store + 组件，不写业务规则。

---

## 3. 领域模型设计

### 3.1 核心实体

```
PlanTag             — 标签（8个上限，12字上限，六位颜色）
SavedPlan           — 方案（选中的比赛+玩法+过关+倍数）
  PlanSelection     — 一次选择（比赛×玩法×结果×赔率）
LedgerOrder         — 账单（投入/回款/状态/冻结方案快照）
LedgerAdjustment    — 回款调整历史
MatchSnapshot       — 比赛快照（主客队、payload）
MatchResult         — 赛果（比分、官方结果）
SyncJob             — 同步任务记录
OddsHistoryEntry    — 赔率历史
AppEvent            — 应用事件日志
```

### 3.2 关键模型约束

```
金额：一律整数「分」；展示层用 utils/money.ts 转「元」字符串
方案 revision：乐观并发字段（savePlan 可传 expectedRevision）
方案 id：主键；revision 不是主键
账单 planSnapshot：冻结快照，方案删除不影响历史账单
标签：纯分类，不表达业务状态（如「已购」不设为标签）
同场单玩法：一次只能选一种玩法
```

### 3.3 仿造要点

- **先定义实体再写页面**。`types/domain.ts` 是契约，所有层都引用它。
- **金额用整数分**是最小的防错投资，任何涉及钱的计算都逃不掉浮点。
- **冻结快照**是账单类的必备模式——方案变了不影响历史记录。
- **乐观并发（revision）** 对于有多人/多端编辑场景是必需品。

---

## 4. 数据层：适配器模式

### 4.1 接口（节选）

完整定义见 `src/services/database/DatabaseAdapter.ts`。教学节选如下：

```typescript
interface DatabaseAdapter {
  initialize(): Promise<void>
  close(): Promise<void>
  transaction<T>(action: () => Promise<T>): Promise<T>

  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>

  listTags(): Promise<PlanTag[]>
  saveTag(tag: PlanTag): Promise<PlanTag>
  renameTag(originalName: string, tag: PlanTag): Promise<PlanTag>
  deleteTag(name: string): Promise<void>
  reorderTags(names: string[]): Promise<void>

  listPlans(): Promise<SavedPlan[]>
  getPlan(id: string): Promise<SavedPlan | undefined>
  savePlan(plan: SavedPlan, expectedRevision?: number): Promise<void>
  importPlans(tags, plans, matches?, results?): Promise<{ tags; plans; matches; results }>
  deletePlan(id: string): Promise<void>

  listMatches(): Promise<MatchSnapshot[]>
  saveMatches(matches: MatchSnapshot[]): Promise<void>
  listLatestResults(): Promise<MatchResult[]>
  saveResults(results: MatchResult[]): Promise<void>

  listLedger(filter?: LedgerFilter): Promise<LedgerOrder[]>
  saveLedgerOrder(order: LedgerOrder): Promise<void>
  savePlanWithLedgerOrder(plan, order, expectedRevision?): Promise<void>
  updateLedgerReturn(id, returnCents, expectedUpdatedAt?, previousReturnCents?): Promise<void>
  updateLedgerNotes(id, notes, expectedUpdatedAt?): Promise<void>
  listLedgerAdjustments(orderId): Promise<LedgerAdjustment[]>
  undoLatestLedgerAdjustment(id, expectedUpdatedAt?): Promise<void>

  saveSyncJob(job: SyncJob): Promise<number>
  saveOddsHistory(entries: OddsHistoryEntry[]): Promise<void>
  recordEvent(event: AppEvent): Promise<number>

  createBackupSnapshot(): Promise<DatabaseBackupSnapshot>
  restoreBackupSnapshot(snapshot): Promise<DatabaseCounts>
  getCounts(): Promise<DatabaseCounts>
  clearLocalData(): Promise<DatabaseCounts>
}
```

### 4.2 双端实现

```
// 文件：src/services/database/createDatabase.ts
// 导出工厂名：getDatabase()（不是 createDatabase）
getDatabase()
  │
  ├─ Capacitor.isNativePlatform()
  │     → CapacitorSqliteAdapter（原生 SQLite）
  │
  └─ else
        → IndexedDbAdapter（浏览器 Dexie/IndexedDB）
```

- **领域表一致**：两端覆盖同一批实体（settings / tags / plans / selections / matches / results / ledger / adjustments / sync_jobs / odds_history / app_events）。
- **实现不同**：原生端用 `schema.ts` 的 `NATIVE_SCHEMA` SQL + `PRAGMA user_version`；浏览器端用 Dexie 对象表定义，**不会执行同一串 SQL**。
- 当前库名 `caiguo_app_v2`，`DATABASE_VERSION = 2`。

### 4.3 设计思路

- 浏览器开发期不需要 Android 编译，IndexedDB 完全够用。
- 适配器接口返回 Promise，不暴露 IndexedDB 游标或 SQLite 事务细节。
- SQLite 迁移用 `PRAGMA user_version` + `NATIVE_UPGRADES`；IndexedDB 用 Dexie version 升级。
- `transaction()` 让应用层做跨表原子操作；原生端另有 `SerialTaskQueue` 串行化写操作，避免嵌套事务。

### 4.4 仿造要点

- **先写接口，再写实现。** 开发期 IndexedDB，真机 SQLite，切换点只有 `getDatabase()`。
- **事务向上暴露。** 例如 `savePlanWithLedgerOrder` 是「保存方案 + 创建账单」原子操作。
- **不用 ORM。** 手动 SQL / Dexie 表操作，可控且无黑盒。
- **金额与校验在写库边界再做一遍**，页面校验不能替代数据库层断言。

---

## 5. 网络层：网关 + 客户端

### 5.1 Http 客户端

```typescript
// src/services/api/httpClient.ts
interface RequestOptions {
  params?: Record<string, string | number>
  timeoutSeconds: number
  retries: number
}

function requestSportteryJson<T>(path: string, options: RequestOptions): Promise<T>
function validateSportteryPayload<T>(payload: unknown): T
```

特点：
- 原生环境走 `CapacitorHttp.get()`，浏览器环境走 `fetch()`（路径前缀 `/sporttery-api`，Vite Proxy 转发到 `webapi.sporttery.cn`）
- 内置重试循环（`attempt <= options.retries`）
- 统一 HTTP 状态检查 + JSON 解析 + 体彩 envelope（`success === true && errorCode === '0'`）

另有 `concurrency.ts` 的 `mapWithConcurrency`，供网关/同步并发拉取历史交锋等。

### 5.2 网关层（Gateway）

```typescript
// src/services/api/SportteryGateway.ts（方法名以源码为准）
class SportteryGateway {
  fetchCurrentMatches(settings): Promise<RawRecord[]>
  fetchHistory(matchId, settings): Promise<RawRecord[]>
  collectMatches(settings, onProgress?, onlyMatchIds?): Promise<{ matches; ... }>
  fetchResultRows(matchDate, settings): Promise<RawRecord[]>
  fetchOfficialResults(...): Promise<RawRecord[]>
  normalizeResult(...): Promise<MatchResult | null>  // 或同步返回，见源码
}

// 另导出
parseOfficialResults(rows): MatchResult['officialResults']
```

网关层负责：
- 调用 `requestSportteryJson` 获取原始 JSON
- 将原始 JSON 映射为应用层类型（`NormalizedMatch` / `MatchResult`）
- 处理字段缺失、类型转换、默认值、合法 outcome 过滤

### 5.3 仿造要点

- **区分客户端与网关。** 客户端只做 HTTP 请求+重试，网关做数据映射。
- **Vite Proxy** 让浏览器开发时不用 CORS 插件；原生直连官方域名。
- **重试**交给客户端，调用方不需要关心网络抖动。
- 新项目复制结构时，把方法名改成自己的领域动词即可，不必照抄体彩命名。

---

## 6. 业务域：Feature 模块

### 6.1 设计原则

每个 feature 是一个目录，只导出纯函数和类型。**没有 Vue 依赖，没有 Pinia 依赖。**

```
features/betting/
  combinations.ts   组合枚举（C(n,m)、笛卡尔积）
  calculator.ts     投注计算（注数、金额、奖金、评估）
  oddsMath.ts       赔率解析、派奖计算
  outcomes.ts       玩法结果编码（HAD: h/d/a, CRS: 0:0 ~ 9:9, ...）
  settlement.ts     按赛果判定输赢/结算状态
```

### 6.2 示例：calculator.ts

```typescript
function calculateBetCount(selections, passCounts): number     // 注数
function calculatePrizeRange(selections, passCounts, multiplier): PrizeRange
function calculateStakeCents(selections, passCounts, multiplier): number
function evaluatePlan(plan, results): PlanEvaluation            // 结算评估
function validateSingleMarketPerMatch(selections): MarketConflict[]
```

所有函数输入 → 输出，无副作用。便于测试和移植。

### 6.3 同步服务

```typescript
// src/features/sync/SyncService.ts + getSyncService.ts
class SyncService {
  constructor(
    private database: DatabaseAdapter,
    private gateway = new SportteryGateway(), // 可选，默认自建
  ) {}

  syncMatches(onProgress?, onlyMatchIds?): Promise<SyncReport>
  syncResults(onlyMatchIds?): Promise<SyncReport>
  fullSync(onProgress?): Promise<SyncSnapshot>          // 比赛+赛果
  syncMatchesOnly(onProgress?): Promise<SyncSnapshot>
  syncResultsOnly(): Promise<SyncSnapshot>
  retryFailed(...): Promise<SyncSnapshot>
  latestSnapshot(): Promise<SyncSnapshot | undefined>
}

// 单例入口
getSyncService(): SyncService  // 内部 new SyncService(getDatabase())
```

同步服务跨越 network + database，是**主要**同时编排两者的模块。Store 通过 `getSyncService()` 触发同步，不直接拼 API URL。

### 6.4 仿造要点

- **把纯计算从组件和 store 中抽出来。** 放在 `features/` 目录下，用 `npm test` 就跑起来。
- **sync 单独一个服务**，负责 API + 数据库的编排；失败可 `retryFailed` 而不是无脑全量重拉。
- **Store 是上下文，不是计算引擎。**

---

## 7. Store 层：Pinia

### 7.1 使用模式

```typescript
export const useTicketStore = defineStore('ticket', () => {
  // 1. 状态（ref）
  const initialized = ref(false)
  const matches = ref<NormalizedMatch[]>([])
  const selections = ref<Record<string, PlanSelection>>({})
  const multiplier = ref(1)

  // 2. 派生（computed）
  const betCount = computed(() => calculateBetCount(...))
  const prizeRange = computed(() => calculatePrizeRange(...))

  // 3. 动作（普通 async function）
  async function initialize() { ... }
  async function refresh() { ... }
  async function savePlan(): Promise<string> { ... }
  async function recordPurchase(): Promise<string> { ... }
  async function loadPlan(id: string) { ... }

  return { initialized, matches, selections, multiplier, betCount, prizeRange,
           initialize, refresh, savePlan, recordPurchase, loadPlan }
})
```

### 7.2 引用关系（以源码为准）

```
useTicketStore  (stores/ticket.ts)
  → getDatabase() → DatabaseAdapter
  → getSyncService() → SyncService → SportteryGateway → httpClient
  → features/betting/calculator.ts
  → features/plans/planName.ts

usePlanStore  (stores/plans.ts，注意单数命名)
  → getDatabase() → DatabaseAdapter
  → features/betting/calculator.ts
  → features/plans/planName.ts
  → useTicketStore().loadPlan(...)   // 当前唯一 store→store 调用：载入方案

useLedgerStore  (stores/ledger.ts)
  → getDatabase() → DatabaseAdapter
  → features/betting/calculator.ts
  → features/ledger/*（调整与展示）

useSettingsStore  (stores/settings.ts)
  → getDatabase() → DatabaseAdapter
  → features/settings/validation.ts
  → getSyncService()（数据更新页相关）
```

页面侧也会直接组合多个 store（例如方案管理页同时用 `usePlanStore` + `useTicketStore`），这是正常的胶水层职责。

### 7.3 仿造要点

- **一个领域一个 Store**，不拆分过细也不合并过大。
- **优先 Store 不调 Store。** 需要跨域时先尝试页面编排或应用服务；本项目「载入方案」是例外。
- **计算交给纯函数**，Store 只做编排。
- **使用 `defineStore` 的 setup 语法**，比 options API 灵活得多。
- **命名以导出为准**：`usePlanStore` 而非 `usePlansStore`。

---

## 8. 设计系统与组件

### 8.1 设计令牌（Design Tokens）

| 类别 | 示例 |
|---|---|
| 颜色 | `--color-primary: #5797f5` |
| 字体 | `--font-size-md: 15px` |
| 圆角 | `--radius-card: 10px` |
| 间距 | `--space-4: 16px` |
| 控件高度 | `--control-height: 40px` |
| 阴影 | `--shadow-card: 0 3px 12px ...` |
| 描边 | `--outline-default: inset 0 0 0 1px var(--color-border)` |
| 动画 | `--duration-fast: 140ms` |
| 触摸 | `--touch-target: 44px` |

所有 token 定义在 `tokens.css` 中，Vant 主题覆盖在 `vant-theme.css`。

### 8.2 基础组件

```
AppButton / AppIconButton     — 按钮
AppCard                       — 卡片容器
AppChip                       — 标签/状态胶囊
AppHeader                     — 一级/二级页标题
AppPage                       — 页面容器（安全区、滚动）
AppState                      — 空状态/错误状态
AppBottomNav                  — 底部导航
AppBottomSheet                — 底部弹出层
AppIcon / AppAssetIcon        — 图标组件
AppInlineEditor               — 内联编辑
AppListGroup                  — 列表分组
AppFormRow / AppRowChevron    — 表单行
SubpageHeader                 — 二级页返回标题栏
DateRangePicker               — 日期范围选择
AppSyncIndicator              — 同步状态指示
confirmAction()               — 统一危险操作确认框
```

### 8.3 组件设计原则

- **base 组件无业务依赖。** 不引入 store，不调 API，props 驱动。
- **多种尺寸。** Button 支持 sm/md/lg，Chip 支持 sm/md。
- **状态覆盖。** 每个 base 组件有 default、disabled、loading 至少三种状态。
- **危险操作统一。** `confirmAction({ danger: true })` 显示红色确认按钮。
- **SVG 通过 CSS mask 着色。** 运行时切图放在 `assets/ui/`，不要引用 `img/`。

### 8.4 Vant 的使用策略

Vant 做稳定成熟的交互组件（Dialog、Picker、Calendar、Toast、Popup），  
**品牌和布局用自建组件 + CSS tokens**。`vant-theme.css` 覆盖 Vant 的主题色、圆角、字体以匹配品牌。

### 8.5 仿造要点

- **先写 tokens.css。** 设计系统从 token 开始，不是从 button。
- **base 组件至少覆盖 3 种状态。** default / disabled / loading，不然后期到处补。
- **状态页（空/错误/离线）不要等 UI 设计——AppState.vue 一个组件管所有。**
- **触摸目标 44px** 是移动端硬指标，超过这个点的 App 总被用户骂。

---

## 9. 页面与路由

### 9.1 层级结构

```
一级路由（底栏导航）：
  /ticket         选票（keepAlive）
  /ledger         账单（keepAlive）
  /settings       设置（keepAlive）

二级路由（hideNav，独立返回）：
  /ticket/current             当前选票详情
  /ledger/:id                 账单详情
  /plans                      方案管理
  /plans/:id                  方案详情
  /plans/:id/tags             方案标签管理
  /plans/:id/combinations     方案组合明细
  /settings/system            系统设置
  /settings/tags              标签管理
  /settings/update            数据更新
  /settings/about             关于
  /settings/data              数据与备份
```

### 9.2 交互层级模型

```
确认框（Dialog）     — 不可逆或高风险操作（删除、覆盖）
  ↑
Bottom Sheet        — 短选择、轻确认（选择标签、设置过滤）
  ↑
二级路由            — 需要输入多个字段、展示大量信息或继续跳转
  ↑
一级路由 + 底栏     — 三大底栏场景：选票 / 账单 / 设置
                      （方案管理从选票进入，属于二级路由）
```

**规则**：一个页面最多保留一层临时浮层（Sheet 或 Dialog，不同时出现）。Sheet 内不能再打开 Sheet。

### 9.3 Android 返回键

```
用户按返回 →
  1. 有 Dialog 显示？→ 关闭 Dialog（点取消按钮，安全）
  2. 有 Sheet 显示？→ 关闭 Sheet
  3. 在二级路由？   → 回父级
  4. 在一级路由？   → 退出 App
```

### 9.4 仿造要点

- **KeepAlive 只给一级底栏页面。** 二级路由每次重新创建，保证数据新鲜。
- **返回键顺序**是移动端最容易被忽视的体验问题，提前定义优先级。
- **用 Route meta 控制底栏和返回行为**，而不是在页面组件中硬编码。

---

## 10. 状态与交互准则

### 10.1 风险分级

| 风险 | 操作 | 反馈方式 |
|---|---|---|
| 低 | 切换玩法、筛选、展开卡片 | 无需确认 |
| 中 | 清空选票、放弃修改 | 一次确认（Sheet 或 Toast 附带撤销） |
| 高 | 删除方案/标签、覆盖保存 | 系统 Dialog，红字确认 |

### 10.2 一个动作一个意图

- **保存方案 ≠ 创建账单。** 两个按钮。
- **记录购买 ≠ 设置标签。** 购买 Sheet 不处理标签。
- **导入方案 ≠ 修改原方案。** 只载入选票。
- **删除方案 ≠ 删除历史账单。** 快照不变。

### 10.3 同步与离线

- 首次无数据：引导刷新。
- 有旧数据 + 刷新失败：继续展示旧数据 + 非阻断提示「离线」。
- 同步中：刷新按钮旋转，页面仍可操作。
- 局部失败：只标记对应行/卡片，不阻断全局。

### 10.4 仿造要点

- **风险分级表**建议在项目第一天写好，之后所有操作对表入座。
- **一个动作一个意图**是避免 UX 困惑的第一原则。
- 同步体验决定了用户对 App 稳定性的第一印象，值得花精力。

---

## 11. 测试策略

### 11.1 分层

```
日常 CI / npm test（Vitest，已进 package.json）
  单元测试（tests/unit/）      — 20 个文件
    calculator、outcomes/settlement、money、校验、名称、
    IndexedDB/SQLite 适配器、SyncService、Gateway、lifecycle 等
  组件测试（tests/component/） — 19 个文件
    base 组件 + 选票/账单/方案/设置相关组件与页面

视口与交互验收（Playwright，工程外/验收脚本）
  当前 package.json 未安装 playwright 依赖
  截图与证据目录：output/playwright/
  tests/visual/ 目前主要是 mocks 资源，不是完整 npm 测试套件
  目标视口：360×800 / 390×844 / 412×915

手动验收（真实浏览器）
  主要路由 × 三档视口 × 115% 字体（见 ACCEPTANCE_MATRIX.md）
```

### 11.2 重点

- 纯函数必须写单元测试（计算、校验、名称、赔率、金额）。
- Mock 数据库适配器，不要 mock 整个 store。
- 金额计算用整数分测试，避免浮点陷阱。
- 组件测试用 `@vue/test-utils` + `jsdom` + `fake-indexeddb`。

### 11.3 仿造要点

- **纯函数先于组件测试。** 业务规则在纯函数中，跑得最快，依赖最少。
- **数据库适配器自己 mock** 而不是用第三方 mock 库——接口简单，自己写几个 mock 函数比学一个 mock 库更快。
- **日常 CI 只绑 Vitest**；Playwright 可作为发布前验收工具，不必强行塞进每个 PR。
- **三档视口溢出检查** 比堆大量 E2E 更划算。

---

## 12. 构建与发布

### 12.1 开发

```bash
npm install
npm run dev                # → http://localhost:5173
npm run typecheck          # TypeScript 检查
npm test                   # Vitest 全部测试
npm run lint               # ESLint + Stylelint
```

### 12.2 构建

```bash
npm run build              # vue-tsc --noEmit && vite build → dist/
npm run android:sync       # npm run build && npx cap sync android
```

### 12.3 CI（GitHub Actions）

- `workflow_dispatch` 手动触发
- 校验版本号格式 + 签名 Secrets
- 跑 lint + test + build + cap sync + apksigner verify
- 输出 `.apk`、`.sha256`、`build-info.txt`，保留 30 天

### 12.4 仿造要点

- **`typecheck` 放在 `build` 之前**，避免打包了错误类型才报错。
- **签名密钥绝不能进仓库。** GitHub Secrets 或环境变量，不留本地文件。
- 新项目建议在 CI 里开 `workflow_dispatch` 手动触发，不要每次 push 都构建 APK。

---

## 13. 从「彩果」迁移到新项目的步骤

如果你要仿照这个架构做新项目，建议按以下顺序：

### Phase 1：工程骨架（半天）

1. `npm create vite@latest` → Vue + TypeScript
2. 安装 Vant 4、Pinia、Vue Router、Capacitor、ESLint、Stylelint、Prettier、Vitest、vue-tsc
3. 写 `tokens.css` / `reset.css` / `typography.css` / `layout.css` / `vant-theme.css`
4. 建目录结构（`src/app/` `src/types/` `src/services/` `src/features/` `src/stores/` ...）
5. 写 `types/domain.ts`——你的业务实体

### Phase 2：数据层（半天）

6. 写 `DatabaseAdapter` 接口
7. 实现 IndexedDB 适配器（开发用）
8. 实现 SQLite 适配器（真机用）
9. `createDatabase.ts` 中导出 `getDatabase()`，两行切换原生/浏览器实现

### Phase 3：网络层（半天）

10. 写 http 客户端（重试 + 超时）
11. 写 Gateway 封装（原始 JSON → 你定义的 entity）
12. Vite Proxy 配置

### Phase 4：业务域（1-2 天）

13. 纯函数——你领域内的计算逻辑（不需要任何框架）
14. 校验器——持久化前的严格校验
15. Store 层——Pinia，调 database + feature 纯函数

### Phase 5：UI（持续推进）

16. 基础组件（Button / Card / Chip / Sheet / 状态页）
17. 页面 + 路由
18. `tokens.css` 调色

### Phase 6：质量（穿插各阶段）

19. 单元测试覆盖纯函数
20. 组件测试
21. Playwright 视口验证

---

## 附录 A：关键文件引用速查

| 文件 | 作用 | 入手点 |
|---|---|---|
| `src/types/domain.ts` | 所有实体定义 | 新项目从改这个文件开始 |
| `src/utils/money.ts` | 元 ↔ 分 | 任何金额 App 直接复用思路 |
| `src/services/database/DatabaseAdapter.ts` | 数据层接口 | 按领域裁剪方法，保持双端一致 |
| `src/services/database/createDatabase.ts` | `getDatabase()` 工厂 | 两行切换原生/浏览器 |
| `src/services/database/schema.ts` | SQLite schema + 版本 | 改成新项目的表定义 |
| `src/services/database/SerialTaskQueue.ts` | 原生写串行化 | SQLite 嵌套事务场景 |
| `src/features/betting/calculator.ts` | 业务计算 | 新项目的纯函数参照此文件 |
| `src/features/sync/SyncService.ts` | 同步编排 | API + DB 编排参考 |
| `src/stores/ticket.ts` | Store 模式 | 新项目的 Store 参考此模式 |
| `src/stores/plans.ts` | `usePlanStore` | 注意导出名与 store 互调例外 |
| `src/styles/tokens.css` | 设计令牌 | 新项目改颜色值即可 |
| `src/app/lifecycle.ts` | Android 返回键 | Capacitor 项目直接复用 |
| `src/app/router.ts` | Hash 路由 + meta | keepAlive / hideNav 约定 |
| `vite.config.ts` | 构建 + 代理 + Vitest | 改 proxy target |
| `docs/refactor/INTERACTION_AND_CLEANUP_PLAN.md` | 交互规范 | 通读一遍理解设计思想 |
| `docs/refactor/ACCEPTANCE_MATRIX.md` | 验收矩阵 | 看「什么叫做完」 |

## 附录 B：文档校验记录（相对源码）

| 类别 | 结论 |
|---|---|
| 技术栈版本 | Vue 3 / Vite 7 / Pinia 3 / Vant 4 / Capacitor 7 / Dexie 4 — 与 `package.json` 一致 |
| App 版本 | `2.0.15` — 与 `package.json` / CI 默认一致 |
| 目录树 | 已补 `utils/money.ts`、`assets/icons/navigation`、`services/migration` 空目录说明 |
| Store 命名 | 文档原写 `usePlansStore` → 已改为源码 `usePlanStore` |
| Store 耦合 | 原「绝对不调 Store」过严 → 改为目标原则 + 载入方案例外 |
| Database 工厂 | 文档原写 `createDatabase()` → 已改为 `getDatabase()` |
| Schema 描述 | 原「两端共用同一 SQL 串」不准确 → 已改为「领域表一致，实现不同」 |
| Gateway / Sync API | 方法名已按源码重写，避免教学假名误导复制 |
| Playwright | 原写成内置测试栈 → 已标明「验收工具，非 npm 日常依赖」 |
| 底栏场景 | 原「四大」→「三大底栏 + 方案二级」 |
| 接口节选 | DatabaseAdapter 标明节选并补关键方法名 |

---

> 本文档基于「彩果·体彩长期账单」项目（v2.0.15）的实际源码和运行经验整理。
> 核心技术栈：Vue 3 + Vite 7 + TypeScript + Pinia + Vant 4 + Capacitor 7。
> 数据层：适配器模式（SQLite / IndexedDB），金额整数分，领域实体严格校验。
> 设计思路的核心三句话：
> 1. **纯函数剥离**——所有不该在组件中的逻辑，放到 `features/` 里。
> 2. **适配器解耦**——数据层换实现不改业务代码。
> 3. **一个动作一个意图**——不要让你 App 的按钮替用户做决定。
