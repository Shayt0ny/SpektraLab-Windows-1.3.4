# Windows 维护与新增代码署名

Windows 维护、整合及本分支新增自动调整代码：**shayt0ny**，2026。
适用代码文件保留 `Copyright (C) 2026 shayt0ny` 或明确限定范围的修改署名。
项目原有 GPL-3.0-or-later 许可不变；此文件记录来源，不对上游代码或
第三方测量数据主张原创。

## 本分支新增代码／实质修改

| 文件或范围 | 本分支内容 |
| --- | --- |
| `desktop/src/shared/autoAdjust.ts` | 独立实现的统计、保守调色建议、截断检查及画面区域测光 |
| `desktop/src/state/session.ts` 的 `autoAdjust` 及相关状态 | 原生小预览分析、复核、过期结果拒绝、一步撤销 |
| `desktop/src/panels/RightRail.tsx` 的自动调整控件 | 自动按钮、忙状态和结果提示 |
| `desktop/src/shared/rawDevelopment.ts`、`windows/RawDevelopmentControl.tsx` | DCP 配置数据流与机内曲线色彩开关 |
| `engine/host/raw_profile.hpp/.cpp` | DCP 解析和 pre-film `colored_raw` 变换集成 |
| `desktop/src/shared/lensProfile.ts` 与 `engine/host/lens_correction.*` 中导入 LCP 部分 | 配置解析、冻结、原生畸变／色差／暗角及自动裁边 |
| `engine/src/gpu/vulkan_memory.hpp`、`vulkan_gpu.cpp` 中 Windows 分配修改 | 兼容共享堆选择、预算检查和回收重试 |
| `engine/host/raw_candidate_api.hpp`、`raw_candidate_module.cpp` 与分派修改 | 候选模块的独立封装、自动及手动选择 |
| `desktop/src/canvas/displayUpload.ts` 与 `glRenderer.ts` 的 Windows 修改 | 保留 16 位的恢复缩图、显示恢复与边界采样修复 |
| 对应新增回归测试及 Windows 修改说明 | 功能、边界和验证记录 |

## 保留的上游与第三方来源

- 光谱模型与原始胶片／相纸配置：Andrea Volpato，
  [spektrafilm](https://github.com/andreavolpato/spektrafilm)。
- 原生 C++／Metal 移植和 macOS 应用：JamesQiu2005（Hanze Qiu），
  [SpektraLab](https://github.com/JamesQiu2005/SpektraLab)。
- LibRaw、候选分支、RawTherapee 曲线、RawSpeed 相机矩阵、Lensfun 等的
  作者、来源与许可仍以各自源码头、资源 NOTICE 和许可证为准。
  `engine/third_party/` 的外部实现及测量数据不会改成 shayt0ny 原创。

自动调整是本分支独立实现，不包含 Adobe 的自动修图算法，也不保证与
Lightroom／Photoshop 的结果相同。署名用于来源追溯，不能阻止代码复制。
