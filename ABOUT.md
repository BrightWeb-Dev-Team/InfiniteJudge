# 关于 InfiniteJudge

InfiniteJudge 是由 **BrightWeb Dev Team** 开发的跨平台在线评测与算法训练平台，面向学校、社团、竞赛团队及个人学习者，提供从题目练习、代码评测到比赛组织和学习管理的一体化体验。

当前版本：**InfiniteJudge v5.0.0 Professional**

## 平台能力

- **在线评测**：支持提交代码、查看评测状态、运行时间、内存占用和测试点结果。
- **题库与训练**：支持题目管理、训练计划、作业发布及学习进度记录。
- **比赛系统**：支持比赛创建、题目编排、参赛管理和排名展示。
- **社区交流**：提供讨论、回复、博客、站内消息和用户主页。
- **组织管理**：支持管理域、成员申请、用户标签及权限分级。
- **用户认证**：支持自定义认证信息、认证审核及公开认证展示。
- **安全登录**：支持密码、BrightWeb OAuth 和通行密钥登录；通行密钥也可用于管理员二次认证。
- **主题与适配**：提供亮色、暗色及流星雨主题，并适配桌面端与移动端页面。
- **扩展能力**：提供 Hydro 风格插件兼容层，可通过插件扩展路由、界面和数据能力。

## 评测与运行环境

InfiniteJudge 可在 macOS、Windows 和 Linux 上运行，无需依赖 Docker。评测服务会根据操作系统选择对应的本地沙箱策略，并对运行时间、进程和文件访问进行限制。

服务器需要预先安装计划开放的编译器或解释器，例如：

- C++：`g++`
- Python：`python3` 或 `python`
- Java：`javac` 与 `java`

生产环境可通过 `IJ_SANDBOX_COMMAND` 接入更严格的外部沙箱方案。

## 安全与隐私

平台密码经过加盐哈希后存储，不保存明文密码。通行密钥基于 WebAuthn 标准，私钥始终保留在用户设备或密码管理器中，服务器仅保存用于验证的公钥凭据。

管理员进入敏感控制区域前需要完成二次认证。认证通过后的有效期为 4 小时，过期后需要重新验证。

站点管理员仍应根据实际部署环境配置 HTTPS、数据库备份、访问控制和安全更新。除 `localhost` 本地开发环境外，通行密钥通常要求站点通过 HTTPS 提供服务。

## 开源与许可

InfiniteJudge 采用自定义的 **InfiniteJudge 部署与署名许可协议**。允许在遵守协议的前提下部署、运行和修改项目，但必须保留清晰、可见且可点击的页脚版权信息：

> Powered by ©2025-2026 BrightWeb Dev Team

完整条款请阅读[许可证页面](/about/license)。

## 项目信息

- 开发团队：[BrightWeb Dev Team](https://github.com/BrightWeb-Dev-Team)
- 项目仓库：[BrightWeb-Dev-Team/InfiniteJudge](https://github.com/BrightWeb-Dev-Team/InfiniteJudge)
- 当前版本：`InfiniteJudge v5.0.0 Professional`

## 致谢

感谢所有使用、测试和改进 InfiniteJudge 的用户与贡献者。问题反馈与功能建议可通过项目仓库提交。
