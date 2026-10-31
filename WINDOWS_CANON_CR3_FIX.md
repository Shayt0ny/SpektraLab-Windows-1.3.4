# EOS R6 Mark III CR3 紫雾修复 · 2026-10-31

用户原片 `0F8A1158.CR3` 的内嵌相机预览颜色正常，RAW 解码画面呈整片紫雾。
切换到“原图”仍然偏紫，因此故障发生在胶片模拟之前。

LibRaw 0.22.2 和当前候选模块把 3778-word、ColorDataSubVer 66 的记录按
旧 ColorData11 布局读取。原片通道黑电平误读为 `0,32,101,67`，
`linear_max` 误读为 `149`。按 ColorData12 的字段位置读取后，原片黑电平
为 `2048`，`linear_max` 为 `14351`，解码颜色恢复正常。
上游同类诊断：<https://github.com/LibRaw/LibRaw/issues/821>。

`engine/cmake/CanonColorData.cmake` 在构建目录生成一份带窄范围修正的
`canon.cpp`，同时用于稳定解码器及候选模块；固定版本的第三方源码目录不改动。
只对记录长度 3778、版本 66 修正黑／白电平字段位置，保留文件自身的数值、
白平衡和相机矩阵，不猜测固定黑电平，也不改变胶片、相纸或调色参数。

`engine/tests/raw_canon_colordata.cpp` 使用合成 MakerNote 记录，覆盖版本 66
的非相同通道黑电平、白电平和原片白平衡，并验证旧版 48 布局不变。
旧库测试退出 1；修复后稳定库与候选库两个测试通过。

真实原片额外验证：两个解码器的源图恢复正常；compatible16 / headroom 的
源图、16 位源图、中性白平衡采样、白平衡切换和精确恢复通过。

修复程序在 `output/SpektraLab-1.3.4-win.8-Canon-fix/`。
先退出当前正在运行的 SpektraLab，再打开修复目录里的 `spektralab.exe`。
显示缓存按实际 host 程序和资源内容计算身份，修复后的程序自动使用新缓存键。
照片原文件及用户编辑不需要删除。
