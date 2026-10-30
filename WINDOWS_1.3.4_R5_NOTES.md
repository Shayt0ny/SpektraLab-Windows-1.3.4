# SpektraLab Windows 1.3.4-win.5 · shayt0ny

本版在 win.4 基础上修复预览显示问题：

- 16 位主预览、缩略图和引擎最终尺寸缩图改进缩小采样，消除已复现的假彩色块。
- 原图与 sRGB／P3 预览使用目标色域的色度映射，保留原先直接截断丢失的高饱和区域层次。
- 保留防止重复压缩高光的处理，中性灰阶与白点测试通过；没有降低胶片颗粒强度。

验证：引擎 47 项、相关前端单元测试 14 项、相关浏览器测试 4 项通过；
浏览器涵盖 73MP UNORM16 上传和预览／导出一致性。Z5 II／Z8 实文件原图和
胶片预览均正常返回非全黑图像。详情和限制见 WINDOWS_PREVIEW_DETAIL_FIX.md。

请完全退出旧版，完整解压到新文件夹后运行 spektralab.exe。不要混用旧版 host
或在压缩包内运行。已有 win.4 压缩包保留不变。

本次修复不能恢复传感器或解码前已截断的高光，也不代表所有照片的噪点均已消除。
自定义 Adobe .lcp 仍仅保存，尚未应用于预览／导出；内置 Lensfun 匹配校准功能保留。
此前其它功能与限制见 WINDOWS_1.3.4_R4_NOTES.md；构建步骤沿用 BUILD_WINDOWS_R4.md，
本版版本号改为 1.3.4-win.5。

原作与官方 Windows beta：JamesQiu2005，https://github.com/JamesQiu2005/SpektraLab
官方基础：spektralab-windows-v1.3.4-beta.1 / fa6096fd74c6f5328dfe78519d82cf5caaa6797c
早期 Windows 移植：NANATATA（历史移植记录）
维护与本版修改：shayt0ny
