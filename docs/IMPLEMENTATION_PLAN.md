# 密语（codebook）产品与实现设计

> **文档状态：** v1 实现基线 / 唯一维护处  
> **最后校对：** 2026-07-31（已完成 6 位主 PIN、Android Keystore 生物识别和页面滚动修复）
> **适用平台：** 浏览器 + Android（Capacitor）  
> **架构参考：** [`ARCHITECTURE_AND_DESIGN.md`](./ARCHITECTURE_AND_DESIGN.md) 仅提供 Vue 3 + Capacitor 的分层模式；产品、数据、安全和验收决策以本文为准。

本文定义本地加密凭据管理应用 **密语** 的 v1 目标状态。英文产品名、工程名、包名和持久化前缀统一使用 **`codebook`**；“密码库”“保险箱”仅作为功能概念，不作为产品名称。

当前仓库已经完成本文定义的 v1 源码实现、自动化门槛、浏览器核心路径和 Android API 36 模拟器核心路径验收。发布状态仍保留 Android 真机回归这一独立门槛；在真实二维码对码、权限矩阵、物理设备截屏/最近任务和系统分享完成真机验证前，不将版本标记为“已发布”。

---

## 1. 产品目标与范围

### 1.1 产品目标

密语是一款无账号、无云端依赖的本地凭据管理器。用户应能在浏览器和 Android 上完成以下闭环：

1. 创建 6 位数字主 PIN 并初始化本地加密保险箱。
2. 解锁后管理账号、密码、网址、备注、分类、自定义字段和收藏。
3. 为一个条目管理多个 TOTP，支持扫码、粘贴 URI 和手工录入。
4. 将条目关联到其它邮箱身份，并在条目之间导航。
5. 搜索、复制敏感内容、自动锁定并控制敏感信息的显示时间。
6. 使用加密备份完整迁移数据，或用 CSV 做有风险提示的明文交换。
7. 在 Android 上控制截屏和最近任务预览保护，并使用指纹或强人脸快捷解锁。

### 1.2 v1 范围

| 能力 | v1 约定 |
|---|---|
| 数据位置 | 仅本机；浏览器 IndexedDB / Android SQLite |
| 加密 | 6 位主 PIN（旧主密码兼容）PBKDF2-SHA-256 + AES-GCM；随机 DEK 加密整库 |
| 条目 | 标准字段、单分类、收藏、自定义字段、多个 TOTP、邮箱关联 |
| 导入导出 | 加密 JSON 完整备份；CSV 明文子集 |
| 平台 | 浏览器与 Android |
| 生物识别 | Android Keystore 认证绑定密钥封装 DEK；指纹/强人脸解锁，失败回退主 PIN |

### 1.3 明确不做

- 云同步、多端账号和共享保险箱
- iOS 适配
- 浏览器扩展、系统自动填充和密码泄露联网检查
- 推送式 2FA、短信 2FA、Steam Guard 等非标准协议
- 从相册选择二维码图片
- 主 PIN / 旧主密码找回或服务端恢复
- Argon2 默认 KDF（保留未来格式升级空间）

### 1.4 v1 完成定义

只有同时满足以下条件，才可将项目标记为功能完整 v1：

- 本文所有 v1 功能均有可用 UI，不存在“只有类型或 Store、页面不可达”的能力。
- 加密备份能够完整往返所有领域数据；失败导入不会覆盖现有保险箱。
- 浏览器自动化质量门槛全部通过，Android 核心路径完成真机验收。
- 历史 Preferences 原始 DEK 会被清除；当前生物识别只保存 Android Keystore 加密后的 DEK 密文。
- Android 屏幕保护、扫码生命周期、后台锁定和返回键行为符合本文约定。

---

## 2. 信息架构与核心交互

### 2.1 页面与路由

| 页面 | 建议路由 | 主要职责 |
|---|---|---|
| 引导 | `/onboarding` | 创建 6 位主 PIN、说明无法找回、初始化保险箱 |
| 锁定 | `/lock` | 优先指纹/强人脸解锁；主 PIN 或旧主密码作为回退 |
| 保险箱列表 | `/vault` | 搜索、分类筛选、收藏排序、新建条目 |
| 条目详情 | `/vault/:id` | 查看与复制字段、展示全部 TOTP、关联与反向引用 |
| 条目编辑 | `/vault/new`、`/vault/:id/edit` | 编辑全部条目字段；未保存内容只存在于页面草稿 |
| 分类管理 | `/categories` | 新增、改名、颜色、排序、删除分类 |
| 设置 | `/settings` | 生物识别、锁定、主题、安全显示、剪贴板、主 PIN 与数据管理 |
| 导入导出 | `/settings/import-export` | 文件选择、导出、预检、风险确认和结果摘要 |
| 修改主 PIN | `/settings/master-password` | 校验当前凭据、输入并确认 6 位新 PIN、重新包裹 DEK |

主导航只保留“保险箱”和“设置”。分类管理作为保险箱列表的二级入口，不新增底部 Tab。

### 2.2 返回键和覆盖层优先级

Android 返回键和页面返回按钮必须遵循同一优先级：

```text
扫码全屏层
  → Dialog
  → Sheet / Picker
  → 未保存编辑确认
  → 二级页面
  → 已解锁根页面：锁定
  → 锁定页：退出 App
```

关闭扫码层时只停止相机并回到当前编辑草稿，不得同时退出编辑页。路由离开、组件卸载、应用进入后台或自动锁定时必须幂等调用 `scanner.stop()`。

### 2.3 一动作一意图

- 保存条目只由页面“保存”按钮触发。
- 添加 TOTP、绑定邮箱、自定义字段操作只修改条目草稿，不能绕过条目保存直接落库。
- 扫码成功后先展示可编辑确认表单；用户确认“添加”后才进入草稿。
- 修改主 PIN、启用生物识别、导入备份、清空数据和关闭屏幕保护都是独立高风险动作。
- 复制账号、密码、TOTP 和自定义字段分别提供独立按钮。

---

## 3. 功能设计

### 3.1 条目与分类

每条凭据记录支持：

| 字段 | 行为 |
|---|---|
| `title` | 必填，去除首尾空白 |
| `url` | 可选；通过平台 URL 服务打开，不直接散落调用 `window.open` |
| `username` | 可选；一键复制 |
| `password` | 可选；显隐、复制和安全随机生成 |
| `notes` | 可选多行文本 |
| `categoryId` | 最多属于一个分类；分类删除后自动置空 |
| `favorite` | 收藏条目在当前排序内优先 |
| `customFields` | 可新增、改名、排序、删除；支持普通或遮罩显示 |

分类支持名称、颜色和顺序。列表页提供“全部 / 未分类 / 指定分类”筛选；搜索仅在当前筛选范围内执行。排序固定为收藏优先，其次按标题本地化排序。

自定义字段的 `value` 无论是否遮罩都属于敏感内容，只能存在于解锁内存和保险箱密文中。

### 3.2 TOTP

每条记录支持 `0..n` 个 TOTP。数组顺序就是展示顺序，不额外增加主 TOTP 字段。

录入方式：

1. 相机扫描标准 `otpauth://totp/...` 二维码。
2. 粘贴 `otpauth://totp/...` URI。
3. 手工输入 Base32 secret，并可设置 issuer、账号名、标签、位数、周期和算法。

默认值为 SHA-1、6 位、30 秒；兼容 SHA-256、SHA-512 和 6/7/8 位。解析器必须拒绝无 secret、非法 Base32、非 TOTP 类型、非正数周期以及不支持的算法，不能静默降级错误参数。

扫码流程：

```text
申请权限 → 打开扫码层 → 解码 → 严格解析
  → 停止相机 → 展示确认表单
  → 用户确认添加 → 写入条目草稿
  → 用户保存条目 → 加密落库
```

二维码若只是 Base32 文本，必须明确提示“检测到密钥文本”，由用户确认后才能作为 secret 使用。不得保存二维码帧、完整 URI 或 secret 到日志和临时文件。

详情页展示全部 TOTP，每项包含标签、issuer/账号、当前验证码、倒计时和复制按钮。`totpRevealSeconds` 规则：

- `0`：解锁后持续显示验证码。
- 大于 `0`：默认遮罩，用户点按后显示，并在指定秒数后重新遮罩。
- 页面卸载或锁定时立即清空全部验证码和定时器。

### 3.3 邮箱关联

条目可关联库内记录或纯文本邮箱。选择库内记录时提供标题、账号、网址和备注搜索，并排除当前条目。

删除被引用条目时，必须在同一次 `VaultPayload` 保存中将所有入站引用转换为文本引用：优先使用 `emailSnapshot`，其次使用 `labelSnapshot`。目标格式不持久化 `broken` 或幽灵 `entryId`。

详情页展示正向关联，并通过内存扫描展示“被哪些条目引用”。关联是单向的；A 关联 B 不会自动修改 B。

### 3.4 主 PIN、生物识别与锁定

- 新建和修改凭据严格使用 6 位 ASCII 数字主 PIN；`VaultMeta.credentialType = 'pin'` 标记新流程。旧记录缺少标记时继续接受原主密码，修改后迁移为 PIN。
- 修改主 PIN 必须验证当前 PIN/旧密码并两次确认新 PIN，只重新派生 KEK 和包裹 DEK，不重新加密整个 payload。
- Android 可在解锁状态启用指纹/强人脸；锁屏优先自动发起一次系统认证，取消或失败后回退主 PIN。
- 修改成功后保存新的 vault record，并保持当前会话解锁。
- 默认空闲 90 秒自动锁定；用户可选择关闭或设置 30/60/90/180/300 秒。
- 应用因 Home、任务切换、系统回收等普通原因进入后台时立即锁定，不受空闲时间设置影响。
- 由密语主动发起的系统文件选择器或分享面板属于受信任外部流程：系统 UI 覆盖期间继续保持 `FLAG_SECURE`，暂不销毁发起页面，使 Android 能交付选择/分享结果；流程结束后恢复普通后台锁定规则。
- 锁定动作必须停止扫码、销毁 TOTP、清除内存中的 DEK 和 payload，并导航到锁定页。

### 3.5 设置

`AppSettings` 的 v1 UI 必须完整覆盖：

- 自动锁定时间
- 剪贴板清除时间
- 主题：跟随系统 / 浅色 / 深色
- TOTP 显示时间
- Android 屏幕保护
- 导入导出
- 修改主 PIN
- Android 指纹/强人脸解锁
- 立即锁定
- 清空本地数据

关闭 Android 屏幕保护前展示风险确认，说明将允许截屏和最近任务预览。浏览器端不显示该设置。

### 3.6 导入导出

加密 JSON 是唯一完整备份格式，包含分类、条目、自定义字段、全部 TOTP 和邮箱关联。导入流程必须先完成结构、版本和密码校验，再原子替换本地数据。

浏览器使用文件选择和下载；Android 使用 Capacitor Filesystem/Share 或等价原生文件服务，不能依赖 WebView 中不可靠的 `<a download>` 作为唯一实现。

CSV 是明文、有损格式：

- 默认列：`title,url,username,password,notes,favorite,category`。
- 不导出 TOTP secret、关联关系和自定义字段。
- 导出前高风险确认；导入只新增合法条目，不覆盖已有条目。
- 导入完成后展示成功、跳过和失败数量。

---

## 4. 架构与数据契约

### 4.1 分层

```text
Views / Components
        ↓
Pinia Stores（会话和状态编排）
        ↓
Features（crypto / totp / credentials / export / settings 纯逻辑）
        ↓
Platform Services（database / scanner / files / screen protection）
        ↓
IndexedDB 或 Android SQLite / Capacitor Plugins
```

- Feature 层不引用 Vue、Pinia 或平台插件。
- Store 不承担密码学、TOTP、CSV 或迁移规则。
- 页面负责组合 Store 和组件，不复制领域校验。
- 所有敏感持久化都经过 `DatabaseAdapter`，不得写入 localStorage。

### 4.2 v2 格式

v1 正式开发前统一切换到不兼容的 v2：

```text
VAULT_FORMAT_VERSION   = 2
PAYLOAD_SCHEMA_VERSION = 2
BACKUP_PACKAGE_VERSION = 2
```

当前开发期 v1 vault 和备份允许清空重建，不实现迁移。检测到旧格式时必须给出明确错误和“清空本地数据后重新创建”入口，不能把旧格式当作主密码错误。

### 4.3 核心类型

```ts
interface VaultRecord {
  meta: VaultMeta
  cipher: VaultCipher
}

interface VaultMeta {
  version: 2
  kdf: {
    algorithm: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    saltB64: string
  }
  wrappedDek: AesGcmBlob
  createdAt: number
  updatedAt: number
}

interface VaultPayload {
  schemaVersion: 2
  categories: Category[]
  entries: CredentialEntry[]
}
```

`VaultRecord` 是最小原子持久化单位。`DatabaseAdapter` 目标接口为：

```ts
interface DatabaseAdapter {
  initialize(): Promise<void>
  close(): Promise<void>
  getVaultRecord(): Promise<VaultRecord | null>
  saveVaultRecord(record: VaultRecord): Promise<void>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  clearLocalData(): Promise<void>
}
```

IndexedDB 使用单事务或单键写入 record；SQLite 使用一个事务提交 meta 和 cipher，禁止两个独立事务产生半更新状态。

### 4.4 条目模型

```ts
interface CredentialEntry {
  id: string
  categoryId?: string
  title: string
  url?: string
  username?: string
  password?: string
  notes?: string
  favorite: boolean
  totp: TotpSecret[]
  linkedEmails: LinkedEmailRef[]
  customFields: CustomField[]
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
}

type LinkedEmailRef =
  | {
      kind: 'entry'
      entryId: string
      labelSnapshot: string
      emailSnapshot?: string
    }
  | {
      kind: 'text'
      email: string
      note?: string
    }

interface CustomField {
  id: string
  name: string
  value: string
  masked: boolean
}
```

v2 将 `totp`、`linkedEmails` 和 `customFields` 规范化为必有数组，避免各层重复处理 `undefined`。

### 4.5 设置模型

```ts
interface AppSettings {
  autoLockSeconds: number
  clipboardClearSeconds: number
  theme: 'auto' | 'light' | 'dark'
  totpRevealSeconds: number
  screenProtectionEnabled: boolean
}
```

- `screenProtectionEnabled` 替代语义不完整的 `hideFromRecents`，Android 默认 `true`。
- 生物识别状态属于设备 Keystore/本地插件能力，不进入可移植设置或备份。
- 设置导入时不覆盖 `screenProtectionEnabled`，避免其它设备的备份降低本机保护等级。

### 4.6 备份包

```ts
interface EncryptedExportPackageV2 {
  format: 'codebook-encrypted'
  packageVersion: 2
  exportedAt: number
  vault: VaultRecord
  settings?: {
    autoLockSeconds: number
    clipboardClearSeconds: number
    theme: 'auto' | 'light' | 'dark'
    totpRevealSeconds: number
  }
}
```

解析备份时对字段类型、版本、KDF 参数范围、Base64 格式和必需字段做严格校验。只有使用备份主 PIN 或旧主密码成功解开 DEK 和 payload 后，才允许调用 `saveVaultRecord()`。

---

## 5. 安全设计

### 5.1 密钥流程

```text
主 PIN / 旧主密码 + 随机 salt
  → PBKDF2-SHA-256（默认 600,000 次，实际值写入 meta）
  → KEK

随机 256-bit DEK
  → AES-GCM 加密 VaultPayload
  → VaultCipher

KEK
  → AES-GCM 包裹 DEK
  → VaultMeta.wrappedDek
```

错误 PIN/密码通过解包 `wrappedDek` 的 AES-GCM 认证失败判断，不另存 verifier。PIN、旧密码和明文 DEK 不落库；salt、KDF 参数、wrapped DEK 和整库密文可以明文持久化。

### 5.2 生物识别处理

旧版开发实现曾把可直接导入的原始 DEK 以 Base64 存在 Capacitor Preferences；启动时仍强制删除 `codebook.biometric.wrappedDek` 历史值。

当前实现由 Android Keystore 生成不可导出的 AES-256 密钥，设置 `setUserAuthenticationRequired(true)` 并要求 `BIOMETRIC_STRONG`。启用时通过 `BiometricPrompt` 授权加密内存中的 DEK，只把 AES-GCM IV 和密文写入原生私有 SharedPreferences；解锁时再次通过 `BiometricPrompt` 授权解密。指纹/人脸信息变化会使密钥失效并清理密文，认证取消、锁定或不可用时回退主 PIN。浏览器不显示生物识别入口。

### 5.3 会话、剪贴板与屏幕

- DEK 和 payload 仅存在于解锁会话内，不进入 Pinia persist、日志或错误上报。
- 复制敏感内容后按设置清空剪贴板；新复制动作替换旧清理定时器。
- Android 解锁后按照 `screenProtectionEnabled` 设置或清除 `FLAG_SECURE`；默认开启。
- 用户关闭保护时必须完成风险确认；重新安装或清空设置后恢复默认开启。
- 自动锁或进入后台时先停止扫码，再清除 TOTP 和会话密钥。

### 5.4 禁止事项

- 以明文 JSON 作为默认或完整备份
- 将 secret、主 PIN、旧主密码、DEK、完整 otpauth URI 写入日志
- 在验证前覆盖当前 vault
- 在组件卸载或锁定后继续持有摄像头
- 将原始 DEK 存入 Preferences、SQLite、IndexedDB 或普通文件
- 把 v2 格式错误伪装成“主密码错误”

---

## 6. 实施里程碑

### M0 — 基线与格式切换

- 全项目展示名称统一为“密语”，英文标识保持 `codebook`。
- 定义 v2 类型、默认值、严格校验和旧格式拒绝流程。
- 将数据库持久化边界改为原子 `VaultRecord`。
- 清理 Preferences 中的历史原始 DEK，并为后续 Keystore 实现保留迁移边界。
- 修复质量工具链，使 lint、test 和 build 可真实执行。

**验收：** 新建 v2 vault 可重载解锁；v1 数据得到明确重置提示；模拟写入失败不会留下半个 vault；历史明文 DEK 不再存在。

### M1 — 领域模型全覆盖

- 分类管理、筛选和分类删除处理。
- 自定义字段增删改、排序、遮罩与复制。
- 全部 TOTP 展示、编辑、排序和显示时间设置。
- 主题设置、Android 屏幕保护设置和主 PIN 修改。
- 设置页提供清空本地数据的二次确认流程。

**验收：** 所有 `CredentialEntry` 和 `AppSettings` 字段均能从 UI 创建、修改、保存并重载恢复。

### M2 — 平台交互与数据交换

- 扫码预览确认、权限拒绝指引、返回键和自动锁并发处理。
- 邮箱选择器搜索、文本快照和删除目标时的原子降级。
- 浏览器和 Android 的文件导入导出服务。
- 加密备份预检、解锁验证、原子替换和结果反馈。
- CSV 明文风险提示、分类列和导入统计。

**验收：** 扫码取消不离开编辑页；失败导入不修改旧数据；加密备份完整往返；Android 能从系统文件选择器导入并保存/分享备份。

### M3 — 发布验收

- 补齐纯函数、Store、组件和平台适配器测试。
- 完成 Android 真机的权限、扫码、后台锁、屏幕保护和文件流回归。
- 检查版本号、应用名、图标、发布构建和隐私说明。
- 执行完整质量门槛并记录结果。

**验收：** 浏览器与 Android 核心路径全部通过，无发布阻断级缺陷。

---

## 7. 当前实现对照（2026-07-31）

| 模块 | 当前状态 | 与目标差距 |
|---|---|---|
| 工程与命名 | 已完成 | 中文展示名为“密语”，英文工程名、包名和持久化前缀为 `codebook` |
| Crypto / v2 格式 | 已完成 | vault、payload、backup 均为严格 v2；错误密码、篡改和旧格式分别处理 |
| IndexedDB | 已完成 | 单键原子保存 `VaultRecord`，替换保险箱与设置使用同一事务 |
| Android SQLite | 已完成并通过模拟器验收 | 使用 `SQLiteConnection` / `SQLiteDBConnection` 管理原生连接；冷启动建库、强制停止后重载和凭据解锁均通过 |
| 条目 / 分类 / 自定义字段 | 已完成 | 全字段 CRUD、分类筛选与管理、排序、遮罩、复制和删除分类降级均可达 |
| TOTP | 已完成 | 多 TOTP、严格且规范化的 URI/Base32、三种算法、排序、扫码确认、issuer/账号展示和定时显示均已接入 UI；锁定或卸载会同步销毁验证码与定时器 |
| 扫码与返回键 | 已完成并通过模拟器可测部分 | Web 本机解析、Android ML Kit、权限弹窗期间取消、幂等停止、扫码层/Dialog/二级页/根页/锁定页返回优先级均通过；权限拒绝有自动化覆盖，待真机权限矩阵与真实二维码验收 |
| 邮箱关联 | 已完成 | 支持文本/库内搜索、正反向展示、快照和被引用条目删除时原子转换 |
| 搜索 / 收藏 / 密码生成 | 已完成 | 当前分类范围内搜索，收藏优先排序，安全随机密码生成 |
| 会话与设置 | 已完成 | 空闲/普通后台立即锁定、受信任系统 UI 生命周期、主题、剪贴板定时及锁定时立即清理、TOTP 显示、立即锁定、清空数据和主 PIN 修改均可用；模拟器 Home/重启锁定通过 |
| Android 屏幕保护 | 已完成并通过模拟器验收 | `FLAG_SECURE` 默认开启；关闭前风险确认，关闭后截图恢复，重新开启后截图再次被阻止；待真机最近任务与物理截屏验证 |
| 导入导出 | 已完成并通过模拟器可测部分 | Android 系统选择器完成 CSV 选择、合法/跳过/失败统计、确认和入库；Filesystem 已写出文件、调用 Share 并在流程结束清理缓存副本，待真机分享目标验收 |
| 生物识别 | 已实现，待真机矩阵 | Android Keystore + AES-GCM 封装 DEK，系统 BiometricPrompt 要求强生物识别；设置页可开关，锁屏自动/手动触发，取消或失效回退主 PIN |
| 自动化测试 | 已完成当前基线 | 21 个测试文件、68 个用例，新增 6 位 PIN、旧密码迁移与备份兼容覆盖；原有 crypto、数据库、TOTP、扫码、剪贴板、文件、会话、路由和生命周期测试保持通过 |

当前剩余工作不是产品功能开发，而是发布设备验收：Android 真机真实二维码对码、权限状态、物理截屏/最近任务和系统分享必须按 8.2 执行。

---

## 8. 测试与发布门槛

### 8.1 自动化测试

| 领域 | 必测场景 |
|---|---|
| Crypto | PIN 创建/解锁、旧密码兼容、错误凭据、密文篡改、修改 PIN、v1 拒绝、v2 往返 |
| Database | 原子保存、并发串行化、失败回滚、清空数据、浏览器重载 |
| TOTP | RFC 6238 SHA-1/SHA-256/SHA-512、位数、周期、非法 URI/Base32 |
| Credential | 分类删除、自定义字段、搜索、收藏排序、关联删除转换、反向引用 |
| Export | v2 严格解析、错误密码不覆盖、完整备份往返、CSV 转义与统计 |
| Session | 空闲锁、后台锁、锁定时销毁 payload/TOTP/scanner |
| UI | 引导、6 位 PIN、生物识别入口、CRUD、分类、多 TOTP、扫码确认、设置持久化与页面滚动 |

### 8.2 Android 设备验收

#### 8.2.1 API 36 模拟器已完成

- 清数据冷启动进入引导页；创建保险箱后生成 `codebook_vaultSQLite.db`。
- 强制停止并重启后进入锁定页，重新输入主 PIN/旧密码可从 SQLite 恢复保险箱。
- Home 切后台后立即锁定；已解锁根页返回锁定，锁定页返回桌面。
- 扫码层返回只关闭扫码并保留编辑页；Dialog 返回只关闭 Dialog；二级页返回上级页面。
- `FLAG_SECURE` 默认开启时系统截图为 0 字节；风险确认关闭后得到有效 PNG；重新开启后再次为 0 字节。
- Android DocumentsUI 可选择真实 CSV，页面完成预览、风险确认、导入统计并在保险箱显示新记录。
- Filesystem 成功写出加密 JSON 并调用原生 Share；当前模拟器无可用分享目标，系统返回 `Share canceled`，应用已将取消作为正常结果处理。
- 当前模拟器权限控制器会自动授予相机权限，无法形成可信的“拒绝/永久拒绝”系统 UI 证据；两条分支由自动化测试覆盖，仍保留真机验收。
- 2026-07-30 基线 APK 在 API 36 AVD 的安装、SQLite 和屏幕保护路径已通过；2026-07-31 新增的生物识别权限和 Keystore 流程仍需在真机重新执行本节矩阵。

主要证据位于 `output/android-acceptance/`，包括引导页、重启锁定、返回键层级、屏幕保护开关、文件选择与 CSV 导入结果的 UI hierarchy/截图。最终刷新证据位于 `output/android-acceptance/final-revalidation/`，其中 `android-api36-final-onboarding.png` 为 API 36 AVD 清数据后的引导页，Gradle 仪器测试报告位于 `android/app/build/reports/androidTests/connected/debug/`。

#### 8.2.2 发布前真机必测

- 扫真实网站 TOTP 二维码并与其它 Authenticator 对码。
- 拒绝、永久拒绝和重新授权相机权限。
- 扫码时返回、切后台、自动锁和进程重建。
- 开启/关闭屏幕保护后验证截屏和最近任务预览。
- 启用/关闭指纹或强人脸解锁；验证成功、取消、连续失败、系统锁定、生物信息变化和无录入状态均能回退主 PIN。
- 从系统文件选择器导入备份，导出并分享备份。
- 杀进程后使用已启用的生物识别或主 PIN 解锁；禁用生物识别后不得继续快捷解锁。

### 8.3 质量命令

发布前必须全部成功：

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx cap sync android
```

2026-07-30 最终自动化基线：

- `npm run typecheck`：通过。
- `npm run lint -- --max-warnings=0`：通过，0 warning。
- `npm test`：通过，20 个测试文件、62 个用例。
- `npm run build`：通过，Vite production build 成功。
- `npx cap sync android`：通过，识别并同步 7 个 Capacitor 插件。
- `gradlew.bat --no-daemon testDebugUnitTest assembleDebug`（Temurin JDK 21.0.12 / Android SDK）：通过，302 个任务，产物为 `android/app/build/outputs/apk/debug/app-debug.apk`。
- `gradlew.bat --no-daemon connectedDebugAndroidTest`：通过，API 36 模拟器执行 `com.codebook.app` 包名仪器测试；同时统一 Android 测试图中的 Kotlin stdlib 版本，消除旧 Cordova 测试依赖的重复类冲突。
- `npm audit --omit=dev`：0 个生产依赖漏洞。

该段记录的是 2026-07-30 生物识别启用前的 Debug APK 基线。当前版本会声明 `USE_BIOMETRIC` / `USE_FINGERPRINT`，新的 APK 大小与 SHA-256 以本轮构建结果为准。

浏览器验收使用 Windows Chrome 150（Playwright 经 CDP 驱动），在 390×844 与 1280×900 视口完成：初始化/解锁、分类、完整条目保存与重载、自定义字段遮罩、多 TOTP、邮箱关联、搜索与分类筛选、主题、TOTP 10 秒重新遮罩、主密码修改、立即锁定、错误密码拒绝、加密备份失败不覆盖与成功往返、CSV 风险确认/预览/导入统计。错误备份密码后原条目仍存在；正确备份密码触发替换确认，恢复完成后强制回到锁屏；CSV 实测为有效 1 条、跳过 1 行、失败 1 条，确认后只新增该有效条目；修改主密码后旧密码被拒绝，新密码解锁后两条记录均完整。引导、解锁、主密码修改、条目编辑和导入页面的密码输入均位于语义化 `form` 中。验收结束时控制台为 0 error、0 warning。

可复核浏览器证据位于 `output/playwright/revalidation/`：`encrypted-backup.json` 是实测下载的 v2 加密备份，`desktop-vault-1280x900.png` 是桌面视口结果。临时 Playwright 会话、控制台日志和追踪文件不属于发布产物，也不提交到仓库。

#### 8.3.1 UI 整体重构与复核（2026-07-31）

- 颜色与视觉权威来源更新为参考目录 `design-review/index.html` 及 `screens.js` 的最新可运行版本；旧 `design-system.md` 中的靛蓝色值不再作为实现依据。
- 品牌统一为中文“密语”、英文 `codebook`，视觉方向调整为“薄荷绿 × 浅天蓝”：深色主背景 `#0f1614`、主色 `#2dd4bf`、辅助色 `#7dd3fc`；浅色主背景 `#f0f9f6`、主色 `#14b8a6`、辅助色 `#38bdf8`。
- 引导、锁屏、保险箱、条目详情/编辑、分类、设置、主密码、导入导出和 TOTP 扫描确认层全部重新设计；业务、加密与持久化行为保持不变。
- 移动端使用底部导航，桌面端使用固定侧边栏；390×844 与 1280×900 下逐路由检查保险箱、详情、编辑、分类、设置、导入导出和主密码页面，文档宽度均等于视口宽度，无横向溢出。
- 密码输入提供显示/隐藏按钮，并补齐浏览器凭据表单语义；条目编辑使用单一语义化表单，顶部保存按钮通过 `form` 属性提交。TOTP 默认显示 10 秒后重新遮罩，锁定或离开页面立即清除显示状态。
- TOTP 扫描层支持初始焦点、焦点循环和 Escape 关闭；Android 扫描阶段使用透明背景以显示原生相机预览。辅助文字不小于 12px，交互目标不小于 44px。
- UI 需求基线见 `docs/UI_REQUIREMENTS.md`；浏览器复核截图位于本地 `output/playwright/`，该目录作为临时验收产物被 Git 忽略。
- 本轮质量基线：TypeScript 检查通过，ESLint 0 warning，20 个测试文件共 62 个用例通过，Vite production build 与 `npx cap sync android` 通过；浏览器核心路由无脚本错误或横向溢出。Linux JDK 21 + Android SDK 35 环境下 `assembleDebug` 通过，Debug APK 为 48,101,411 字节，SHA-256 为 `82e90206a1ab3f1b0f187449a9236141a1883836a5143bdcfc11daefc70f8993`。

#### 8.3.2 主 PIN、生物识别与滚动修复（2026-07-31）

- 新保险箱和修改流程使用严格 6 位数字主 PIN；VaultMeta 增加可选 `credentialType: 'pin'`，旧记录和旧备份缺少标记时仍接受原主密码，修改后迁移为 PIN。
- Android 新增 `BiometricVault` 原生插件。DEK 仅在内存与 Capacitor 调用返回值中短暂出现，持久化材料是认证绑定 Keystore AES 密钥产生的 AES-GCM 密文；浏览器端保持不支持状态。
- 锁屏在已启用时自动发起一次指纹/强人脸认证，并提供手动按钮；用户取消不会显示错误，直接回退主 PIN。设置页提供启用/关闭和硬件、录入、安全更新等状态说明。
- 导入其它保险箱或清空本地数据时同步删除生物识别密文和 Keystore 条目；修改主 PIN 不更换 DEK，因此已启用的生物识别仍可继续使用。
- 修复 `.app-shell` 未形成受限高度的问题，保险箱与设置页面重新由 `.app-page` 纵向滚动。
- 自动化基线更新为 21 个测试文件、68 个用例；浏览器和 Android 原生构建结果见本轮发布记录。

#### 8.3.3 Android 全局滚动与编辑按钮复修（2026-08-03）

- 移除 `body overflow:hidden + .app-page flex 内层滚动` 组合，所有路由统一使用 WebView/浏览器原生文档纵向滚动；`.app-shell`、`.app-main` 和 `.app-page` 以 `100dvh` 作为最小高度，不再锁死内容高度。
- Router 增加 `scrollBehavior`：普通路由切换回到顶部，浏览器前进/后退恢复保存的滚动位置。
- 编辑页保存按钮把图标移出正常排版流，文字以按钮边界独立居中；粘性标题栏停靠在安全区下方。
- 390×700 Chromium 触控模拟验证：设置页和新建条目页均可由文档 `scrollY` 正常滚动，路由切换回到顶部。
- API 36 Android WebView + ADB 真实触摸验证：设置页 `scrollY 0 → 448`，新建条目页 `scrollY 0 → 491`；保存文字中心与按钮中心偏差约 0px，滑动后粘性标题栏保持可见。

Android 原生门槛分为三层：Gradle `assembleDebug` 已通过；API 36 模拟器核心路径已通过；8.2.2 的真实二维码、权限矩阵、物理截屏/最近任务和系统分享仍必须在真机完成，模拟器或编译成功不能替代真机结论。

### 8.4 逐项证据审计

| 计划要求 | 权威证据 | 结论 |
|---|---|---|
| “密语”/`codebook` 命名、包名与版本一致 | `tests/unit/version.test.ts`、Android `strings.xml`、`capacitor.config.ts`、API 36 包名仪器测试与安装包 `versionName=1.0.0` | 通过 |
| 所有 v1 页面可达，主导航仅保险箱/设置，密码流程使用语义表单 | `tests/unit/router/routes.test.ts`、`src/App.vue`、五个密码相关页面源码、浏览器双视口验收与 Playwright trace | 通过 |
| 全部条目字段与设置可保存、锁定后重载 | `tests/unit/session/session.test.ts` 的全字段/全设置往返，条目编辑、详情与设置页面验收 | 通过 |
| 分类删除置空与被引用条目删除降级在一次 payload 保存中完成 | `tests/unit/session/session.test.ts`、`tests/unit/credentials/helpers.test.ts`、`src/stores/vault.ts` | 通过 |
| 多 TOTP、三算法、位数/周期与严格 Base32/URI | RFC 6238 和非法输入用例位于 `tests/unit/totp/totp.test.ts`；完整字段备份往返位于 `tests/unit/export/package.test.ts` | 通过 |
| 扫码取消、权限拒绝、权限弹窗期间锁定/取消与幂等停止 | `tests/unit/scanner/QrScanner.test.ts`、`tests/unit/navigation/*`、API 36 返回键证据 | 自动化/模拟器通过；真实权限矩阵待真机 |
| 锁定或卸载立即销毁 DEK、payload、TOTP、扫码与敏感剪贴板 | `tests/unit/session/session.test.ts`、`tests/unit/utils/clipboard.test.ts`、`EntryDetailView.vue` 同步清理、扫码生命周期测试 | 通过 |
| URL 统一经过平台服务，敏感复制统一经过定时清理 | 全源码检索仅 `openUrl.ts` 使用 `window.open`，仅 `clipboard.ts` 直接访问 Clipboard API；详情页统一调用两项服务 | 通过 |
| vault/payload/backup 严格 v2，旧格式不伪装为密码错误 | `tests/unit/crypto/vaultCodec.test.ts`、`tests/unit/session/session.test.ts`、`tests/unit/export/package.test.ts` | 通过 |
| PBKDF2 + 随机 DEK + AES-GCM，修改密码只重新包裹 DEK | crypto 测试覆盖创建、错误密码、篡改、持久化与 rewrap；payload 密文保持不变 | 通过 |
| IndexedDB/SQLite 原子 record、替换、串行化与清空 | 两个数据库适配器测试；API 36 冷启动、强停重载和 SQLite 解锁证据 | 通过 |
| 加密备份完整往返，错误密码/替换失败前不修改当前 vault | 全领域集合备份测试、session 错误密码不覆盖测试、IndexedDB/SQLite 原子替换测试 | 通过 |
| CSV 明文风险确认、有损列、合法/跳过/失败统计且只新增 | export 单测、浏览器验收、API 36 DocumentsUI 实际文件导入证据 | 通过 |
| Android 文件分享使用原生 Filesystem/Share，结束后清理缓存副本 | `tests/unit/platform/files.test.ts`、API 36 Share 调用证据 | 模拟器通过；真实分享目标待真机 |
| 生物识别只持久化 Keystore 加密材料，历史原始 DEK 被清理 | `BiometricVaultPlugin.java`、`biometric.ts`、session 导入/重置清理与 Android 权限清单 | 源码/编译通过；真机认证矩阵待验收 |
| 敏感内容不写 localStorage/Pinia persist/日志 | 全源码静态检索无 local/sessionStorage、持久化插件或 console 日志；敏感持久化仅数据库适配器和用户主动导出流程 | 通过 |
| `FLAG_SECURE` 默认安全启动、风险确认开关和恢复 | `MainActivity` 在 WebView 启动前置位；模拟器开启/关闭/恢复截图证据 | 模拟器通过；物理截屏与最近任务待真机 |
| 真机真实二维码、物理权限/截屏/最近任务/分享/进程恢复 | 8.2.2 清单 | **待真机，发布阻断** |

---

## 9. 已锁定决策与假设

1. 中文产品名为“密语”，英文和工程标识为 `codebook`。
2. 本文定位为目标设计与实现基线，同时保留发布验收差距，不再维护从零搭建的日程估算。
3. v1 采用整库 AES-GCM 密文 blob，本地规模不引入单条记录加密或云端并发模型。
4. 当前 v1 开发数据允许清空；正式目标直接使用不兼容的 v2 格式。
5. 模型中已有的分类、自定义字段、主题、TOTP 显示和屏幕保护全部属于功能完整 v1。
6. Android 屏幕保护默认开启，用户可经风险确认关闭。
7. Android 生物识别只允许使用认证绑定的 Keystore 密钥封装 DEK；不支持或失败时始终保留主 PIN 回退。
8. 加密 JSON 是权威完整备份；CSV 永远是明文、有损交换格式。
9. 浏览器与 Android 是 v1 发布平台，其它平台和云能力均不阻塞 v1。
