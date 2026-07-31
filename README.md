# 密语 · codebook

密语是一款浏览器与 Android 双端运行的本地加密凭据管理器，基于 Vue 3、TypeScript 和 Capacitor。

## 功能

- v2 本地保险箱：PBKDF2-SHA-256 派生 KEK，随机 DEK + AES-GCM 加密整库
- 账号条目：网址、账号、密码、备注、收藏、分类与自定义字段
- 多 TOTP：扫码、`otpauth://` URI、手工 Base32，支持 SHA-1/256/512
- 邮箱关联：链接库内条目、文本邮箱、反向引用和删除快照转换
- 搜索与分类筛选、密码生成、剪贴板定时清除、自动/后台锁定
- 跟随系统/浅色/深色主题和 TOTP 定时隐藏
- 加密 JSON 完整备份、CSV 明文子集导入导出
- Android `FLAG_SECURE` 屏幕保护，默认开启且可经风险确认关闭
- 新保险箱使用 6 位数字主 PIN；旧保险箱仍可用原主密码解锁并平滑迁移
- Android 指纹或强人脸快捷解锁，DEK 由认证绑定的 Android Keystore 密钥封装

旧原型曾将原始 DEK 写入 Preferences，当前版本启动时仍会主动清理该遗留数据。新的生物识别实现只持久化 Keystore 加密后的 DEK 密文；生物信息变化或认证不可用时回退主 PIN。

## UI 设计

当前界面已按“薄荷绿 × 浅天蓝”方向整体重构，使用低对比半透明表面、清晰的信息层级与一致的 44px 最小触控区域。移动端采用底部主导航，桌面端切换为侧边栏；核心页面同时适配 390×844 与 1280×900，并提供浅色、深色和跟随系统三种主题。主 PIN、密码与 TOTP 默认遮罩，所有凭据流程使用语义化表单和可访问的显示/隐藏控件。

## 文档

- [产品与实现设计](docs/IMPLEMENTATION_PLAN.md)
- [Vue/Capacitor 架构参考](docs/ARCHITECTURE_AND_DESIGN.md)
- [UI 需求规范](docs/UI_REQUIREMENTS.md)

## 开发

```bash
npm install
npm run dev
```

完整质量门槛：

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run build
```

## Android

```bash
npm run android:sync
cd android
./gradlew assembleDebug
```

真机发布前应验证二维码扫码、指纹/人脸启用与回退、权限拒绝、后台锁定、截屏保护、系统文件导入导出和进程重建。

## GitHub Actions 打包

仓库内置 `Build Packages` 工作流：

- 推送到 `main`、创建面向 `main` 的 PR，或在 Actions 页面手动运行时，会执行类型检查、Lint、单元测试、Web 构建和 Android Debug APK 构建。
- 构建结果在 Actions 运行页的 Artifacts 中保留 30 天，包含可安装的 Debug APK 和 Web 静态文件压缩包。
- 推送 `v*` 标签（例如 `v1.0.0`）时，会在测试和打包全部通过后自动创建 GitHub Release，并附上 APK 与 Web 压缩包。

手动发布版本示例：

```bash
git tag v1.0.0
git push origin v1.0.0
```

工作流使用 GitHub 托管的临时构建环境，不需要把个人访问令牌、Android SDK 路径或签名文件提交到仓库。当前产物为使用 Android 默认调试证书签名的 Debug APK；正式商店发布应另行配置受保护的签名 Secrets。

## 安全边界

- 主 PIN/旧主密码、明文 DEK 和解密 payload 只存在于解锁会话内。
- 持久化最小原子单位为 `VaultRecord { meta, cipher }`。
- 默认 PBKDF2 迭代次数为 600,000，实际参数写入 vault 元数据。
- 加密备份需要导出时使用的主 PIN 或旧主密码；CSV 是包含密码的明文有损格式。
- 主 PIN 无法找回，丢失且无法使用已启用的生物识别时只能清空本地数据重新创建。
- Android 设置 `android:allowBackup="false"`，降低系统备份带出数据的风险。
