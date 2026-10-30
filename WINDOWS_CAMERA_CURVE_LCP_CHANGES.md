# 机内曲线色彩与 LCP 更新记录

日期：2026-10-30。源码及开发构建已更新；未覆盖 win.6 发布包，未上传 GitHub。

## 本轮改动

1. 原图按钮旁加入“机内曲线色彩”，`apply_camera_curve` 默认 `false`。
2. 按用户确认使用本机／用户导入的 DCP 配置，明确显示配置来源。
   缺配置保持关闭并提示；不冒充尼康 Picture Control，也不承诺等同 Adobe Color。
3. 真正改变数据流：RAW 解码 → 线性 ProPhoto → 可选镜头矫正 →
   可选 DCP 变换，生成 `colored_raw` → 上传给 `spk_open` → 胶片／相纸。
   关时不插入曲线计算，使用旧的解码像素。
4. 导入 RAW LCP 后立即应用当前照片。修正 Adobe 常见 Photoshop XML
   命名空间识别，保留标定中心、焦距归一化、畸变、色差和暗角参数。
   自动裁边；配置随照片保存，预览和导出使用同一份数值。
5. 导出冻结相机／镜头配置；与当前会话不同则独立重新解码，避免导出
   仍使用旧设置。白平衡吸管在曲线开启时读取未套曲线的线性像素。
6. 补齐已有后端参数入口：胶片响应 Gamma、扫描白点／黑点校正、扫描镜头
   模糊，以及原仓库 `center_weighted` 测光。默认值维持原设置。

## RAW 入口与色域核对

- RAW 入口：`engine/src/io/raw_decoder.cpp`，兼容解码仍是
  `output_color=4`、`gamm=[1,1]`，输出线性 ProPhoto。
- 色彩入口：`engine/host/main.cpp::camera_curve_after_decode`，
  变换实现位于 `engine/host/raw_profile.cpp`。
- 胶片入口：`engine/host/main.cpp::engine_open`，把选择后的像素交给
  `spk_open`。开启时此处收到 `colored_raw`，不是在最终显示端补滤镜。
- 曲线开启后保留 ProPhoto 基色，但明暗关系已按配置调整，不能再把它
  称为“未经处理的场景线性 RAW”。没有转去 sRGB/P3 后再进胶片，也没有
  再做一次输入 Gamma 解码。物理胶片／相纸数组与光谱算法未修改。

## 改动文件

| 文件 | diff 摘要 |
| --- | --- |
| `engine/host/main.cpp` | 配置协议、解码后曲线、`colored_raw` 上传、独立导出、线性白平衡取样 |
| `engine/host/raw_profile.hpp/.cpp` | 有界 DCP 解析、本机配置查找、相机匹配、双光源矩阵／色彩表、曲线和浮点中间结果 |
| `engine/host/raw_profile_curve.inc` | Adobe 作者配置缺少显式曲线时使用的 RawTherapee 默认表，附版权归属 |
| `engine/host/image_io.hpp/.cpp` | 镜头／相机配置选项及 RAW 矫正接线 |
| `engine/host/lens_correction.hpp/.cpp` | 自定义 Adobe Camera Model，传感器坐标、相机通道色差和自动裁边 |
| `engine/host/tiff_ifd.hpp/.cpp` | DCP 头部标识的显式解析选项，普通 TIFF 校验不放宽 |
| `engine/host/CMakeLists.txt` | 编译新实现和针对性原生测试 |
| `desktop/src/windows/TopBar.tsx`、`RawDevelopmentControl.tsx` | 原图界面的开关、本机配置读取、DCP 导入、缺配置提示 |
| `desktop/src/panels/LensProfileImport.tsx`、`RightRail.tsx` | LCP 实际应用、状态、恢复开关和 Gamma／测光入口 |
| `desktop/src/panels/LeftRail.tsx` | 扫描校正／镜头模糊控件 |
| `desktop/src/shared/sidecar.ts`、`whiteBalance.ts`、`rawDevelopment.ts`、`lensProfile.ts` | 默认关闭、持久化与不可变解码快照、LCP 解析 |
| `desktop/src/shared/params.ts`、`clipboard.ts`、`protocol.ts` | 参数 wire、复制设置分组、实际应用状态 |
| `desktop/src/state/session.ts`、`host/client.ts` | 解码后原图刷新、相机配置读取方法 |
| 协议、测试和许可证文件 | 同步新选项、数据流约束、归属和针对性验证 |

## 验证结果

- TypeScript 检查通过，33 项相关前端测试通过。
- 原生已知曲线、原始缓冲区独立性、中性校准、色相及错误配置检查通过。
- LCP 合成标定：真实变形、裁边、8 种 EXIF 朝向和错误输入检查通过。
- Z8 NEF：省略开关与显式关闭结果相同；关闭与已交付 win.6 的原图、
  胶片像素逐字节相同；开启后源像素与胶片结果都改变；再关闭精确恢复。
- Z8：冻结开启配置导出、校样／实际文件一致、编辑会话不被独立导出改写。
- RW2＋自有合成 LCP：原图改变并裁边，预览与导出逐字节相同，关闭恢复，
  当前会话关闭时仍能按冻结配置正确导出。
- 输入 RAW 的 SHA256 前后不变。测试系数证明实现生效，不代替镜头光学标定。
- 未运行全量测试，未重新打包或发布。

## 测试方法

在根目录构建：

```powershell
cmake --build build/beta --target spektralab-host spk_host_lens spk_host_camera_curve -j6
build/beta/engine/host/spk_host_camera_curve.exe
build/beta/engine/host/spk_host_lens.exe build/beta/engine/host/lcp-fixtures
python engine/tests/host_camera_curve.py --host build/beta/engine/host/spektralab-host.exe --resources build/beta/engine/resources --raw "你的照片.NEF"
python engine/tests/host_lcp_import.py --host build/beta/engine/host/spektralab-host.exe --resources build/beta/engine/resources --raw "你的照片.RW2"
```

真实 RAW 的相机曲线验证需要该相机的本机 DCP；原生自有曲线测试不需要 Adobe 软件。
`host_camera_curve.py` 可加 `--baseline-host` 与 `--baseline-resources` 对照旧包。
前端在 `desktop` 下运行：

```powershell
node_modules/.bin/tsc -p tsconfig.web.json
node_modules/.bin/vitest run src/windows/RawDevelopmentControl.test.tsx src/shared/lensProfile.test.ts src/shared/cameraCurve.test.ts src/shared/whiteBalance.test.ts src/shared/sidecar.test.ts src/state/session-source.test.ts
```

默认曲线表来源和 GPL 归属见 `engine/third_party/RawTherapee-NOTICE.txt`。
不随发布包分发用户的 Adobe DCP／LCP／照片。
