# SpektraLab Windows 1.3.4 · shayt0ny

胶片模拟软件 SpektraLab 的 **Windows 移植版**。原版只有 macOS，这里把它搬到了 Windows 上：打开 RAW 照片，选好胶片和相纸，就能得到按真实冲印过程模拟的效果。

本分支由 **[shayt0ny](https://github.com/Shayt0ny)** 继续维护，Windows 移植基础来自
原始项目为 **[JamesQiu2005/SpektraLab](https://github.com/JamesQiu2005/SpektraLab)**。
1.3.4 的升级内容、颜色修复、显存保护和验证范围见
[发布说明](RELEASE_NOTES_1.3.4_zh-CN.md)。

## 📥 下载

- `SpektraLab-1.3.4-shayt0ny-Windows-x64.zip`：完整解压后运行 `spektralab.exe`。
- `SpektraLab-1.3.4-shayt0ny-Source.zip`：对应源码，构建方法见 [BUILD_WINDOWS.md](BUILD_WINDOWS.md)。

请先完全退出旧版，保留解压后的整个文件夹。每个包内有逐文件校验清单，
外部 `SpektraLab-1.3.4-shayt0ny-SHA256SUMS.txt` 用于核对两个压缩包。
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
