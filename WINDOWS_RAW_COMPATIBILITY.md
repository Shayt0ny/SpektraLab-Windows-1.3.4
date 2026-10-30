# win.7 RAW 兼容与显示恢复修复记录

项目来源：Andrea Volpato 的 spektrafilm、JamesQiu2005 的 SpektraLab。
Windows 维护：shayt0ny。完整第三方作者与许可保留于相应 NOTICE。

## 用户可见变化

- 设置 → 渲染 → RAW 解码器：自动（默认）、LibRaw 0.22.2、候选解码器。
- 自动模式仅在 RAW 解码失败后尝试候选模块；GPU 渲染错误不会误触发切换。
- 照片信息及日志标识实际后端。两者都不支持时分别显示原因。
- Nikon ZR 的缺失颜色矩阵由其确切机型的配置补齐，不套用相邻机型。
- WebGL 连接丢失时等待短暂恢复；无恢复事件时重建画布。恢复阶段限制
  显示纹理，最多自动重建三次，仍失败时可手动点击“重建预览”。
- 用户取消了预览分辨率档位任务；本版不改变正常预览档位和后台全尺寸行为。

## 改动文件与数据流

- `engine/cmake/RawCandidate.cmake`、`engine/setup-raw-candidate.py`：校验并
  构建固定候选源码，输出独立 DLL。原始 LibRaw 0.22.2 源码与归档不改动。
- `engine/host/raw_candidate_api.hpp`、`raw_candidate_module.cpp`：同一构建的
  私有模块接口，异常不跨模块；结果复制后由原模块释放。
- `engine/host/image_io.cpp`：探测、缩略图及线性解码的自动／手动分派。
  候选解码后仍输出线性 ProPhoto，后续镜头、DCP、胶片管线顺序不变。
- `engine/src/io/camera_libraw.hpp`、`engine/resources/io/Nikon-ZR-profile-NOTICE.txt`：
  只在 ZR 缺少矩阵且没有文件配置时补齐；原有配置优先。
- `desktop/src/shared/{sidecar,whiteBalance,protocol}.ts`、`state/{session,settings}.ts`、
  `windows/Dialogs.tsx`：设置持久化、重新解码、照片与半格快照、冻结导出。
- `desktop/src/canvas/{Canvas,glRenderer,displayUpload}.ts*`：连接重建、恢复缩图、
  保留 16 位纹理数据；缩图导数在边缘／对比条件分支之前计算，避免未定义结果。

## 验证

- ZR 无损压缩能打开；自动／LibRaw／候选三模式的原图采样一致。
- 用户提供的 ZR HE 和 HE★：稳定版拒绝，自动与候选成功；源图、胶片、
  自定义白平衡变化与 As Shot 恢复、导出校样通过；原文件 SHA256 不变。
- Z9、Z8、Zf、Z6 III、Z5 II、Z50 II 共 12 份 HE／HE★ 样片的完整
  Bayer 像素 SHA256 与候选项目固定参考值完全相同。
- 自动／强制选择测试：`engine/tests/host_raw_decoders.py`，传入只读样片路径。
- 原始像素检查工具：`spk_raw_nikon_he`，输出新建 `.u16` 文件，拒绝覆盖。
- 浏览器模拟连接丢失且不发送恢复事件，验证重新显示像素；
  16 位源插值、浮点画布及 8 位兼容画布通过，精度测试连续重复五轮。

## 边界

候选是固定的公开开发分支，不是 LibRaw 官方 HE 正式版，也不保证支持
所有相机格式。AMD 用户反馈的原机器尚未实测；浏览器模拟恢复通过不能
等同于已经排除其驱动问题。没有改写胶片／相纸测量数据，也没有更改原照片。
