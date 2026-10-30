# spektrafilm 原始模型与 Windows 渲染线路审查

日期：2026-10-30。对象：本地 win.6 源码。**最初阶段是源码、参数和资源文件审查，
当时按用户要求没有运行新的测试。随后仅按下述新增授权做了边界验证；未打包、提交或上传。**
下列“代码可确定的行为”与“仍需图像验证的问题”分开记录，不能据此宣称整条管线通过。

后续更新：用户随后仅授权先验证后期整数边界。已完成该项限定的 Vulkan 对照，
详见 [边界验证记录](WINDOWS_POSTDEV_BOUNDARY_CHECK.md)；这不是恢复整套测试或整条管线验收。

## 参照顺序与来源

1. Andrea Volpato 的 [spektrafilm](https://github.com/andreavolpato/spektrafilm)，
   固定提交 `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`，作为胶片、相纸和光谱模型的主要参照。
2. 它列出的独立移植／应用：vkdt、spektrafilm OFX、spektrafilm-rs、ART；用来交叉核对实现选择。
3. JamesQiu2005 的 SpektraLab：本产品的 C++/Metal 和应用层来源；Windows 基础为
   `spektralab-windows-v1.3.4-beta.1`，提交 `fa6096fd74c6f5328dfe78519d82cf5caaa6797c`。
4. NANATATA 的早期 Windows 移植，以及 shayt0ny 的后续 Windows 维护。

Mac 仓库 README 明确署名 Andrea Volpato 并链接 spektrafilm，也列出了程序 GPL 与
数据 CC BY-SA。复用、移植本身不能作为“偷代码”的证据。本次没有完成逐提交的法律合规鉴定，
也不对作者动机作判断。来源链和各自修改应分别保留，不能用一个项目的链接代替全部来源。

## 文件对照：有没有把胶片数据改坏

静态清单：`build/spektrafilm-origin-static.json`；生成脚本不导入或执行任一渲染器。

- 原仓库的 28 个配置均存在，没有漏掉或错换胶片／相纸。
- 20 个配置解析后的 JSON 完全相同；字节差异来自本地换行。
- 另外 8 个相纸配置只有新增的 `data.edr_tone_map`：这是 SpektraLab 输出扩展，
  不是原始测量数据。去除该新增字段后，28 个配置的完整原始内容均相同。
- 原版中性冲印滤镜数据库与本地解析后的内容相同。
- 抽查的 10 个关键文件与保留的官方 Windows beta 源码逐字节相同：
  `params.cpp/.hpp`、`profile.cpp`、`hanatos.cpp`、`printing.cpp`、`pipeline.cpp`、
  三个颗粒生成着色器，以及前端 `shared/params.ts`。
- 这是指定文件／资源的结论，不能扩大成“所有代码没问题”。此前本分支的输出转换、
  缩图、显示传输及内存管理修复仍需独立评估，不能被这份相同文件清单背书。

原先许可证变更记录写“28 份配置逐字节未修改”不准确，本轮修正文案；
没有改动测量数组、重烘焙资源或把旧 ZIP 中的文件替换成新文件。

## 渲染线路逐段对照

| 阶段 | 原项目主要位置 | Windows 主要位置 | 审查结果 |
|---|---|---|---|
| RAW 解码、白平衡 | `utils/raw_file_processor.py` | `src/io/raw_decoder.cpp`、`host/image_io.cpp` | 有真实边界差异，见下面第 1 项 |
| 测光与线性输入 | `utils/autoexposure.py`、`runtime/pipeline.py` | `Pipeline::film_prefix`、`measure_exposure_ev` | Windows 先解传递函数再测光；默认测光方法与原项目不同 |
| RGB→光谱→胶片曝光 | `runtime/stages/filming.py`、`utils/spectral_upsampling.py` | `node_upsample`、`node_exposure` | 都以线性场景光驱动胶片；不能把 Adobe Color 显示外观直接作为该阶段输入 |
| 光晕、散射 | `model/diffusion.py` | `halation_blurs`、`node_halation` | 默认 1 的常规模型接近；非默认强度语义不同，CineStill 另有扩展 |
| 密度曲线与 DIR | `model/develop.py`、`model/couplers.py` | `node_film_curves`、`node_dir_couplers` | 主顺序一致；负片、正片、Velvia、Provia 的专用 DIR 系数与原项目相同 |
| 颗粒 | `model/grain.py` | `grain_realise`、`spk_rng.glsl` | 物理参数与分层公式相符；随机数生成器和默认种子策略不同，不能逐像素比随机图 |
| 冲印、预闪、相纸显影 | `runtime/stages/printing.py` | `node_enlarger_spectral`、`node_print_exposure`、`node_print_curves` | 都先光谱透射、后相纸显影；默认相纸不同，直接改变最终颜色与反差 |
| 扫描、眩光、色域 | `runtime/stages/scanning.py` | `print_spectral/glare/linear/scan_finish/output` | 主顺序相符；Windows 增加 ProPhoto 工作空间、后期和末端输出转换，不能当作原项目同一条输出链 |
| 缓存与后期 | 原项目主要保持浮点处理 | `view::render`、`view_process.cpp` | 胶片结果在后期前量化为 UNORM16，是需优先核查的截断边界 |
| 预览／导出 | 原项目的处理与写出 | `render_source`、`render_view`、`export_frame` | 使用不同入口；已有共享后期路径，但入口精度和来源选择仍需分别验证 |

### 1. RAW 的颜色空间与截断位置不同——优先核查

原版 `raw_file_processor.py` 先让 rawpy/LibRaw 输出 **16 位线性 ACES**，
再以浮点做目标空间转换；Windows `configure_compatible` 直接输出
**16 位线性 ProPhoto**。在线性、无裁剪、相同色度适应条件下换工作空间应保持意义；
这里有整数裁剪和白点处理边界，不能只因为两端最后都写 ProPhoto 就认为相同。

Windows 兼容解码的 RGB 已被限制到 0…1，进入胶片前丢掉的值不能靠后期负曝光找回。
已有 opt-in `headroom` 解码可以保留矩阵转换的负值与大于 1 的 RGB，但仍使用整数去马赛克，
并不是全浮点 RAW，也不恢复已经剪掉的传感器值。其界面、回退和支持范围还需设计。

此前同张 Z8 的三路对照已将主要暗灰差异定位到 RAW 显影外观：LrC 的已显影 TIFF 经
SpektraLab 显示接近原 TIFF，直接 RAW 则不同。这不等于已证明 ACES／ProPhoto 截断
是那张照片的全部根因，也不意味着 Adobe Color 等于更换色域标签。

用户已经选定：未来 RAW 配置显影开关应统一作用于原图、无胶片预览及无胶片导出；
胶片物理输入保持独立线性。当前 DCP／Adobe Color 颜色表只有私有诊断原型，尚未接入产品。

### 2. 默认测光和相纸不同——代码可直接确定

| 项目 | spektrafilm 原版 | 当前 Windows 应用 |
|---|---|---|
| 默认胶片 | Portra 400 | Portra 400 |
| 默认相纸 | Portra Endura | Supra Endura |
| 默认自动曝光 | `center_weighted`，加权线性亮度均值 | `balanced`，裁去极端值后的对数亮度均值 |
| 胶片长边标尺 | 35 mm | 默认 135 画幅按照片比例计算，3:2 时为 36 mm |
| 引擎输出 | 默认 sRGB | ProPhoto 工作图，后期后再转显示／导出空间 |

这些差异继承自 SpektraLab，Mac 也有。特别是 `center` 不是原版 `center_weighted` 的别名：
前者仍是截尾对数均值。因此比较两端“默认效果”无法隔离渲染器是否算错。
后续应提供明确的原版参考配置，而不是静默改掉用户已有侧车和调色。

### 3. 光晕、眩光控制语义不同——会影响调整时的感觉

原项目光晕幅度改变返回光的权重，范围由单独的 `halation_spatial_scale` 控制。
SpektraLab 的 `halation_amount` 同时将半径乘以 `sqrt(amount)`，眩光也采用类似面积规则。
当强度为 1 时这一项不引入差别；拖动强度后，扩大范围会同时改变局部对比、暖色扩散和亮部形状。
这是 Mac 层公开记录的设计分歧，不应误报为某个 Windows 着色器偶发错误。

CineStill 800T 的 alias、无防光晕层反射模型及额外高光余量也属于 SpektraLab 扩展，
并不是这份原版 28 个配置的独立实测 CineStill 数据。应作为独立模型说明，不能混称原版一致。

### 4. 后期前的 UNORM16 缓存——已确认截断行为，影响范围待验证

`view::render` 的胶片分支在 `spk_to_rgba16` 中先 clamp 到 0…1，再交给后期调色。
原始 Python 计算链在这一位置保持浮点。Windows 后续即使读取成 float，也无法还原该步
已剪掉的负值或超白值。启用 EDR 或扫描锐化后，该位置尤其值得核查。

不能由源码中的 clamp 就推断所有 SDR 照片都损失细节：普通输出可能已在有效范围内，
Mac 显示也有整数边界。这是本轮标出的**具体风险点**，尚无本轮新渲染结果证明其对用户样片的影响。
可行方向是让后期前保留浮点胶片缓存，最后读回／写文件时才量化；要同时核算大图显存和 DI／半格兼容。

后续限定验证发现：真实 Z8 缩小样片在默认／-2 EV 下没有明显差异，
局部差异主要在扫描锐化的负值参与饱和度、对比度、阴影操作时出现；关锐化后消失。
因此这不是已证实的整体灰片主因，不能直接把“改 float 缓存”当成完成修复。

### 5. 黑白颗粒滑块上段响应受限——可从参数公式确定

黑白胶片先乘自身颗粒标定，再 clamp 到引擎上限 2。Tri-X 标定 1.70，
所以界面强度约 1.176 以上发送的值都为 2；HP5 标定 1.49，约 1.342 以上同样到顶。
这是 Mac 与 Windows 共用的限制，不能解释彩色 Z8 的全部异常，但会让部分“调整没变化”。
未来应明确显示实际可用上限，或分开“标定量”和“用户倍率”的协议设计，不能单改前端突破引擎范围。

## 参数审查：哪些应该补，哪些不能直接复制

| 选项／组 | 当前情况 | 后续整合方向 |
|---|---|---|
| 原版中央加权测光 | 引擎支持 `center_weighted`，界面主要显示新测光意图 | 加明确入口，避免与 `center` 混淆 |
| 胶片密度曲线 Gamma | 原版有；Windows 引擎已有 `density_curve_gamma`，界面未开放 | 可增加胶片显影控制，独立于后期对比度；保留侧车、复制和导出快照 |
| 光晕强度／范围 | 原版分开；移植版强度带面积变化，范围未完整开放 | 先决定参考模式与兼容模式，再补范围，勿用同名掩盖不同含义 |
| 颗粒面积、RGB 比例、均匀度、染料云模糊 | 引擎有内部参数，主界面只有总强度／分层开关 | 放入高级颗粒组前先确认统计和单位；不直接篡改胶片 JSON |
| 扫描镜头模糊、黑白点校正 | 部分已有协议字段，界面未开放 | 优先暴露已有安全功能；直接扫描正片的组合有明确拒绝，须联动禁用 |
| 扫描锐化半径／量 | 原版可调，移植版主要内置默认值 | 需要完整端到端字段，不能只加一个无效滑块 |
| 相纸曲线 morph／相机与放大机 diffusion | 原版有，本地没有对应的完整公开控制链 | 作为后续引擎工作，不能把其它项目的 UI 或 shader 直接粘贴进来 |
| 输入／输出色彩空间 | 输入自动识别、输出配方已有 | 保持空间标签、传递函数、矩阵和目标映射一致，不把色域当显影风格 |

以上是接入清单，**不是本轮已经新增的界面功能**。本轮不改现有参数含义或默认值。

## 五个链接分别是什么，能借鉴什么

| 项目 | 定位 | 适合本项目借鉴 | 不可直接视为等价替代 |
|---|---|---|---|
| [high-level writeup](https://discuss.pixls.us/t/spectral-film-simulations-from-scratch/48209) | Andrea 的原理说明与早期示例 | 负片／冲印曝光分工、相纸对观感的影响、DIR 解释 | 文章的早期示例参数不能冒充当前主分支基线 |
| [vkdt filmsim](https://jo.dreggn.org/vkdt/src/pipe/modules/filmsim/readme.html) | Vulkan 节点式实现 | GPU 常驻、阶段拆分、内存与校准表管理 | 输入为线性 Rec.2020；直接接 ProPhoto 会错色，默认 glare 等也不同 |
| [spektrafilm OFX](https://github.com/chaert-s/spektrafilm-ofx) | Resolve／Nuke 等宿主的 OpenFX 插件 | 颗粒、光晕、输入输出管理的明确分组及 GPU 分块；可读其 Vulkan 实现 | OFX 有宿主色彩管理和自己的生产模式、校准，不能只换着色器 |
| [spektrafilm-rs](https://github.com/turbasvin/spektrafilm-rs) | Rust／wgpu 移植，另有 f64 CPU 路径 | 独立参考计算、随机与插值的验证方法、预览与导出边界 | 作者的 bit-identical 声明有指定范围，不能当作本项目已验证或全部模块逐像素相同 |
| [ART bridge](https://artraweditor.github.io/SpectralFilmSimHowto) | RAW 编辑器与外部 3D LUT 的桥接 | 正确交接线性图像、LUT 生成和后端选择 | 桥接时关闭颗粒、空间与随机效果、自动曝光；不能替代完整空间胶片渲染 |

补充源码定位：OFX `86476afc5b077de77e2278e3658d1ba9309892a1`；
vkdt `957699add3a508eee98b52a139eb4bf5ea5039e7`；
spektrafilm-rs `9dd59b0380194b93686aaa230a8bb9680aa270a4`；
ART `9ecc845f5baefaf6b261c1626a8b312c7c4e04f8`。
参照项目不是全部代码都已审完，本轮读了其文档及所述关键模块／桥接代码，没有编译或安装。

## 本轮结论与后续顺序

没有发现原始测量数组被本分支改坏；主胶片阶段顺序也未发现明显颠倒。
已找到输入解码边界、默认相纸／测光、非默认光晕／眩光语义、后期前整数缓存等
可具体定位的差异或风险，不能再笼统归因于 WebView2 或显卡。

建议后续依次处理：

1. 建立可选择的原版参考配置并冻结双方实际参数，而非比较各自默认界面。
2. 核查 RAW 整数转换，以及胶片缓存进入后期前的范围损失；RAW 配置显影仍单独实施。
3. 再决定原版强度／范围控制的兼容方式，以及颗粒／扫描高级控制的开放范围。
4. 用户允许恢复测试后，先用同一线性输入、关闭随机项逐阶段对照；颗粒另比较统计和缩图。

现有 win.6 ZIP、已导出照片及用户侧车未改动。本轮新增审查文档并纠正数据修改说明，
没有把未运行验证的变更称为渲染修复，也没有把借鉴项目的代码混入当前引擎。
