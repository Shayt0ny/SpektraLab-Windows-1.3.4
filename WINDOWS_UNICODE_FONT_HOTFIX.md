# Windows 中文安装路径字体加载修复

适用于 1.3.4-win.2 / win.3 中出现以下启动错误的情况：

`cannot load the font for HelveticaNeue from .../host/engine/fonts`

用户提供的日志显示引擎在初始化字体阶段失败，还未导入照片。安装路径中
含“柯达”。本机用完整资源和含中文、空格、特殊字符的安装目录复现了
完全相同的错误，因此该故障与 Nikon Z5 II RAW 的颜色矩阵或显存无关。

根因：`engine/src/pipeline/edge_raster.cpp` 将 UTF-8 路径直接传给 Windows
窄字符 `fopen`，该接口按系统 ANSI 代码页解释路径；其他核心资源已走
宽字符路径，字体读取遗漏了这一处。修复使用现有 UTF-8 路径转换并调用
`_wfopen`，Linux 行为不变。不替换字体、不跳过字体检查、不改变画面算法。

验证：新增 `engine/tests/host_unicode_resources.py`，旧引擎在中文目录启动
失败，修复后通过字体初始化、Vulkan 启动和中文照片路径的片框/日期渲染。
19 项引擎 CTest 全部通过。该测试使用生成的图片，不需要用户的照片。

此完整运行包沿用 win.3 界面，因此程序内版本仍显示 `1.3.4-win.3`；文件名
加 `fontfix` 区分修复构建。只更新了 C++ 引擎程序，保留 LCP 导入入口及
此前修复。**LCP 仍仅保存配置，尚未应用到预览或导出。**

完全退出旧版后，完整解压此运行包再运行，不要把新旧文件混放。
仍建议在对方电脑验证；若字体资源确实缺失或被安全软件隔离，也可能出现
同类错误，这次路径修复不能替代缺失的文件。

原作：JamesQiu2005/SpektraLab；Windows 移植：NANATATA；维护：shayt0ny。
