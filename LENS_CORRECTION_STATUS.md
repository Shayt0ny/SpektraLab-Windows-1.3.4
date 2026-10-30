# 镜头矫正调查：在 1.3.4-win.2 打包之后

**2026-10-30 源码更新（未打包）：** 自定义 RAW LCP 已接入解码后的
实际像素矫正，并参与原图、胶片输入和导出。支持透视／鱼眼模型、具备
完整 RGB 模型时的横向色差，以及暗角；自动裁去几何黑边，保持输出尺寸。
配置数值随照片冻结保存。真实 RW2 的预览／导出、关闭恢复和独立导出
验证已通过；合成标定覆盖 8 种 EXIF 朝向。这里验证的是实现与数据流，
不代表任何用户镜头文件的测量准确性。下面“仅保存”均为旧版历史。

**win.4 更新：** 已整合官方 Windows beta.1 的 Lensfun 矫正处理与匹配配置。
下方关于“尚未接入处理库”的内容是 win.2/win.3 时的历史调查。
自定义 Adobe LCP 仍仅保存，尚未参与预览/导出；自动匹配配置的矫正与
LCP 导入是两个功能。最新状态见 WINDOWS_1.3.4_R4_NOTES.md。

状态：矫正处理尚未修复。已新增 Adobe LCP 文件导入入口，未重新打包。
已交付的运行包和源码包保持不变；本文件是交付后的调查记录。

## Adobe LCP 导入入口

用户指定 Adobe `.lcp` 格式后，在镜头矫正开关下新增了导入按钮。
选择单个文件后先检查扩展名、8 MB 大小上限、XML 结构、Adobe 命名空间
和矫正数值；通过后将文件名、镜头名和原始 XML 副本存入应用自己的
`LensProfiles/imported`。支持替换、重新启动后读取和移除；取消或
验证/写入失败时保留先前副本。原文件不被改写，也不扫描照片文件夹。

**导入仅保存配置，尚未将其应用到预览或导出。** 界面在按钮下明确说明，
镜头矫正开关仍禁用。当前没有修改 RAW 解码、画面几何或导出路径。
结构检查不代表完整支持所有 LCP 模型，也不代表镜头匹配或光学校准通过。
用户导入的文件保存在本机应用数据中，不进入发布包。

## 灰色开关的来源

- `desktop/src/panels/RightRail.tsx` 主动禁用镜头矫正行。
- `engine/host/main.cpp` 的 `decode_options` 对 `lens_correction: true`
  返回 `unsupported`，不是开关未绑定或导入失败。
- Mac 的 `modern_UI/Spektrafilm/Spektrafilm/Import/ImageDecoder.swift`
  使用 Core Image 的 `CIRAWFilter` 镜头矫正能力；当前 Windows LibRaw
  解码路径没有接入同等的几何、暗角与横向色差处理。

## 已核实的照片与配置库

只读探测本机测试照片得到：

| 相机 | RAW 中的镜头名称 | 本次下载的 Lensfun 数据库 |
| --- | --- | --- |
| Nikon Z5_2 | Viltrox AF 40/2.5 Z | 未找到对应镜头条目 |
| Nikon Z 8 | Viltrox AF 35mm f/1.2 LAB Z | 未找到对应镜头条目 |

下载来源：<https://github.com/lensfun/lensfun/archive/refs/heads/master.zip>

下载文件 SHA256：
`9f0e200956000c3713e71a4063a1b721d505cb8555ce5771a682523d14b61fa1`

检查了所有 `data/db/*.xml` 中的 Viltrox 条目；有 35mm F1.8 Z 等其他
型号，但不能替代 35mm F1.2 LAB Z，也不能把 Nikkor 40mm 配置套给唯卓仕。
这仅说明本次数据库快照缺少配置，不代表其他来源或未来版本一定没有。
本地复核脚本和详细报告为 `build/check-lens-support.py`、
`build/lens-support.json`，不会进入已交付的源码包。

## 构建尝试与后续要求

用现有 MinGW 工具链配置 Lensfun 静态库，C/C++ 编译器检查通过，
但在查找 `glib-2.0` 时失败：`Could not find glib2`。
日志为 `build/lensfun-configure.log`；还没有生成可调用的处理库。

后续要补齐可再现的 Lensfun/GLib Windows 构建及许可证，并提供精确的
镜头配置匹配和能力报告。若这两支镜头仍无配置，需要取得合法可用的
校准数据，或用专门的畸变/暗角/色差测试照片进行标定，现有普通照片
不能证明校正系数正确。

实现应在 RAW 解码阶段处理，预览、原图对比、导出使用同样的几何；
不能修改胶片或相纸配置来抵消镜头问题。需要验证裁切、方向、边缘覆盖、
关闭后恢复及大图内存使用。配置缺失时应说明原因并保持不可用。

官方参考：<https://lensfun.github.io/manual/latest/>，
数据库：<https://github.com/lensfun/lensfun/tree/master/data/db>。
