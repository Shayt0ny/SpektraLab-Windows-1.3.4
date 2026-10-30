# SpektraLab Windows 1.3.4-win.7 · shayt0ny

胶片模拟软件 SpektraLab 的 **Windows 维护分支**。项目起源于 macOS，现在已有官方 Windows 测试版；本分支在此基础上整合兼容性修复与导入流程改进。打开 RAW 照片、选择胶片和相纸，模拟真实冲印过程。

光谱胶片、相纸模型与原始配置来自 **Andrea Volpato** 的
**[spektrafilm](https://github.com/andreavolpato/spektrafilm)**；
原生 C++/Metal 移植与 macOS 应用来自 **[JamesQiu2005/SpektraLab](https://github.com/JamesQiu2005/SpektraLab)**。
本 Windows 分支由 **shayt0ny** 继续维护，原版权和第三方许可证随包保留。
1.3.4 的升级内容、颜色修复、显存保护和验证范围见
[发布说明](RELEASE_NOTES_1.3.4_zh-CN.md)。
本次 Windows 修订新增 Z5 II 白平衡兼容、缩小预览颗粒滤波和选择照片导入，
详情及尚未确认的问题见 [Windows 修订说明](WINDOWS_1.3.4_R2_NOTES.md)。

**win.7 整合更新：** 原图界面新增默认关闭的“机内曲线色彩”，可读取本机或导入的 DCP，
在胶片渲染前生成 `colored_raw`。自定义 RAW `.lcp` 现已实际作用于像素并自动裁边，
照片、预览和导出使用冻结的同一份配置。核显／共享内存分配补上兼容堆回退，继续保留
显存预算、系统 commit、缓存回收、分块传输和批量导出驻留保护。
新增自动／LibRaw／候选 RAW 解码器选择、Nikon HE／HE★ 与 ZR 兼容，
并修复 WebGL 连接丢失后的恢复和 16 位边界缩图采样。
详见 [win.7 发布说明](WINDOWS_1.3.4_R7_NOTES.md)、
[曲线与 LCP 改动](WINDOWS_CAMERA_CURVE_LCP_CHANGES.md)、[共享内存修复](WINDOWS_UMA_MEMORY_FIX.md)。
[RAW 与显示恢复记录](WINDOWS_RAW_COMPATIBILITY.md)列出本次兼容性验证和边界。

此前 win.6 补齐 16 位原图预览传输与精度协商，保留前版预览彩噪和颜色层次修复。
详见 [win.6 发布说明](WINDOWS_1.3.4_R6_NOTES.md)。

原模型、Windows 渲染线路及衍生项目的源码审查见
[spektrafilm 对照报告](WINDOWS_SPEKTRAFILM_PIPELINE_AUDIT.md)。
该报告包含尚待验证的差异；当前已实现内容以 win.7 发布说明和对应修复记录为准。

此前 win.5 修复 16 位预览缩图假彩噪及目标色域截断造成的颜色层次丢失。
详见 [win.5 发布说明](WINDOWS_1.3.4_R5_NOTES.md)。

此前 win.4 以官方 Windows `spektralab-windows-v1.3.4-beta.1` 为新基础，
整合大图内存优化、原生预览/导出、自动镜头配置匹配及本分支修复。
新增拖入照片选择弹窗；默认预览 sRGB。
详情见 [win.4 发布说明](WINDOWS_1.3.4_R4_NOTES.md)。

## 📥 下载

- `SpektraLab-1.3.4-win.7-shayt0ny-Windows-x64.zip`：完整解压后运行 `spektralab.exe`。
- `SpektraLab-1.3.4-win.7-shayt0ny-Source.zip`：对应源码，构建方法见 [BUILD_WINDOWS_R4.md](BUILD_WINDOWS_R4.md)。

请先完全退出旧版，保留解压后的整个文件夹。每个包内有逐文件校验清单，
外部 `SpektraLab-1.3.4-win.7-shayt0ny-SHA256SUMS.txt` 用于核对两个压缩包。
本地生成发布包与 GitHub 上传是两个步骤；本说明未声称这些包已在线发布。

## 使用前请注意

- 系统：Windows 10 或 11（64 位）
- 显卡：需要支持 Vulkan 并装好显卡驱动（近几年的 NVIDIA、AMD、Intel 显卡一般都可以）

## 可以做什么

- 30 多款胶片和相纸：Kodak、Fujifilm、CineStill，以及 Tri-X、HP5 等黑白胶片
- **片边**：把照片印在真实的胶片条上，带边码、齿孔、片门（135、半格、XPan、120 各画幅）
- **日期后背**：在照片上打印胶片相机风格的日期
- **半格配对**：两张照片放在同一格胶片上（选中两张后按 Ctrl+J）
- 导出 JPEG / PNG / TIFF，以及 Cineon 数字中间片

## 原作者

本项目基于 **JamesQiu2005（Hanze Qiu）** 的 [SpektraLab](https://github.com/JamesQiu2005/SpektraLab)（macOS 版）移植。胶片模拟引擎来自 **Andrea Volpato** 的 [spektrafilm](https://github.com/andreavolpato/spektrafilm)。

原版说明：[中文](README.original.zh-CN.md) · [English](README.original.md)

## 许可

程序与引擎：GPL-3.0-or-later；胶片与相纸配置：CC BY-SA 4.0。
