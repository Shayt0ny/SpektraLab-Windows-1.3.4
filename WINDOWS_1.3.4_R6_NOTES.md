# SpektraLab Windows 1.3.4-win.6 · shayt0ny

在 win.5 基础上补齐原图预览精度：Mac 原图纹理为十六位，之前 Windows
原图传输固定为八位。本版支持原图 RGBA16，客户端协商精度并严格验证格式，
原图缓存键同步包含精度；旧引擎仍可使用原有八位方式。

保留 win.5 的预览缩图假彩噪修复、目标色域映射、避免重复压缩高光，以及
在 ProPhoto 工作空间调色后转换到目标空间的顺序。

验证：前端完整测试 427 项通过、1 项可选项跳过；相关浏览器 6 项通过。
原生显示／无胶片测试及原图协议检查通过；Z5 II 和 Z8 分别验证兼容／高光
余量解码下的八位与十六位原图、手动白平衡和精确恢复 As Shot。
详细原因、验证范围与默认 RAW 外观差异见 WINDOWS_MAC_PREVIEW_AUDIT.md。

请完全退出旧版，完整解压至新文件夹后运行 spektralab.exe。不要混用旧版
host 或在压缩包内运行。win.5 旧包保持原样。

注意：Apple RAW 显示处理与 LibRaw 线性解码的默认外观仍可能不同；
高精度传输不等于恢复已截断的高光或消除真实噪声。自定义 Adobe .lcp
仍仅保存，尚未应用于预览／导出。其余功能与限制继承前版。
构建步骤沿用 BUILD_WINDOWS_R4.md，维护版本号为 1.3.4-win.6。

原作与官方 Windows beta：JamesQiu2005，https://github.com/JamesQiu2005/SpektraLab
官方基础：spektralab-windows-v1.3.4-beta.1 / fa6096fd74c6f5328dfe78519d82cf5caaa6797c
早期 Windows 移植：NANATATA（历史移植记录）
本版维护：shayt0ny
