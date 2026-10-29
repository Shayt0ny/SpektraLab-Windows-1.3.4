# SpektraLab Windows 1.3.4 · shayt0ny

## 项目来源与署名

1. 原始 macOS 项目：[JamesQiu2005/SpektraLab](https://github.com/JamesQiu2005/SpektraLab)。
2. Windows 移植基础：[SpektraLab-Windows-NANATATA](https://github.com/YZH2006517/SpektraLab-Windows-NANATATA)，署名 NANATATA。
3. 本版 Windows 继续维护、升级与修复：[shayt0ny](https://github.com/Shayt0ny)。

原作者、第三方组件、胶片与相纸数据的署名和许可证继续保留。
软件为 GPL-3.0-or-later；数据及各组件按随附许可证授权。

## 升级内容

- Windows 程序版本更新为 1.3.4，保留 Windows Vulkan 后端。
- 补齐“不应用胶片模拟”：保留原解码画面，仍可裁切及进行显影后调整。
  选择胶片会恢复模拟；双半格配对不启用该选项，DI 仍导出模拟负片。
- 补齐 CineStill 800T 的高光余量控制，正确显示其没有防光晕层。
- 按原版校准黑白胶片的颗粒强度。
- 场景置位即时本地计算，可用区间及边界提示同步更新。
- 补充导出中文标签和日期后背裁剪回归检查。

## 修复内容

- 修复输出端重复压缩高光：灰阶测试中的白色从误输出约 228 恢复为 255。
- 曝光、高光、饱和度等显影后调整统一在 ProPhoto 工作空间进行，
  最后转换到显示或导出空间；不再随导出方案改变调色工作空间。
- 预览使用高精度纹理，最终明确输出 sRGB，不按浏览器的 P3 报告自动切换。
- 保留显存预算检查、闲置缓存回收、失败后的恢复，以及大图后台导出。
- 保留显示连接恢复和 Sony ILCE-7RM6 RAW 有效画面范围修复。

## 验证

84 项前端及真实引擎测试全部通过；18 项引擎测试通过。
另完成灰阶、色彩、模拟开关、低显存失败恢复，以及
7168×10240 全尺寸渲染、预览上传和导出检查。
独立运行程序的版本号、资源加载和实际 Windows 画面已检查。

Mac 的 RAW 解码与显示系统和 Windows 不同；本版未宣称所有相机、
显示器或所有照片都与 Mac 逐像素相同。显存保护也不代表任意效果组合
都能在 12 GB 显存内完成。内置胶片颗粒属于效果，可在界面中调低或关闭。

## 两个发布包

- `SpektraLab-1.3.4-shayt0ny-Windows-x64.zip`：解压后运行 `spektralab.exe`。
- `SpektraLab-1.3.4-shayt0ny-Source.zip`：对应源码、构建说明、测试与许可证。

本地发布包不含私人照片、个人配置和测试日志。生成包不等于已上传 GitHub。
