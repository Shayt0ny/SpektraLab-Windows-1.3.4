# SpektraLab Windows 1.3.4-win.8 · shayt0ny

本版在 win.7 上加入可选的“一键自动调整”，正常打开照片不会自动套用。
代码范围署名与上游来源见 `AUTHORS_WINDOWS.md`；原有 GPL 许可和第三方
NOTICE 保留。项目来源仍为 Andrea Volpato 的 spektrafilm 与
JamesQiu2005 的 SpektraLab，Windows 维护：shayt0ny。

## 使用

打开照片，进入右侧“显影后 → 曝光”，点击“一键自动调整”。
它会调整曝光、对比度、高光、阴影、黑场、白场与饱和度；结果仍是原有
滑块数值，可继续微调，按 Ctrl+Z 整体撤销。批量导出沿用每张已保存或
冻结的参数；本版没有增加“对所有照片批量自动修图”的操作。

RAW 解码白平衡、机内曲线色彩、胶片／相纸配置及其他手动调色项保留。
半格需要切回“胶片”层再对整张拼接自动调整；逐孔调色仍可手动操作。

## 实现与保护

- 只读取长边至多 512 像素的原生小预览，确定使用 sRGB 数据分析，
  支持 8／16 位像素；与显示器色域设置无关。
- 每次测量先将七个自动参数归零，避免重复点击累积结果。其他手动参数
  保留；使用正常的原生 ProPhoto 调色、显示和导出链，不另改胶片模型。
- 片边用引擎返回的画面四边形测光，半格用两个照片区域，排除边框与间隙。
- 通过真实调色器复核建议；若增加高光或阴影截断，尝试更保守的建议，
  仍不合适则保留原调整。不会生成额外的全尺寸分析渲染。
- 分析期间若切图、手动修改参数、重新解码或开始批量导出，过期结果
  不会覆盖新状态。一次成功应用只产生一个撤销步骤。
- 均匀黑／白／灰或有效样本不足时不强行调整。

这是本分支独立实现的保守调色起点，不包含 Adobe 的自动修图算法，
不保证与 Lightroom／Photoshop 的结果相同，也不能恢复解码时已经裁切
掉的 RAW 通道信息。摄影意图仍需用户判断；默认曝光变化限制在 ±1.2 EV。

## 验证方法

前端算法／状态测试：`desktop/src/shared/autoAdjust.test.ts`、
`desktop/src/state/session-auto.test.ts`；界面测试：
`desktop/tests/e2e/auto-adjust.spec.ts`。覆盖不叠加、一步撤销、过期结果、
截断保护、极端尺寸取样、片边／半格间隙及按钮可用状态。

真实引擎检查使用独立合成照片和可选的只读 RAW：

```powershell
# 在源码根目录，已安装 desktop 的开发依赖
.\desktop\node_modules\.bin\esbuild.CMD engine/tests/auto_adjust_bridge.ts --bundle --platform=node --format=esm --outfile=build/auto-adjust-bridge.mjs
python engine/tests/host_auto_adjust.py --host build/beta/engine/host/spektralab-host.exe --resources build/beta/engine/resources --bridge build/auto-adjust-bridge.mjs
# 可加 --raw "你的只读RAW路径"；测试只在临时目录生成图片
```

实测暗片、亮片、逆光、饱和色、灰阶、平坦画面、Portra 胶片、片边及
一张 RW2。自动参数经原生调色后生效，胶片参数与原文件校验保持，
校样和 TIFF8 导出像素一致。完整前端测试 459 项通过，1 项可选真实
引擎用例跳过；最终成品检查记录在包内 `RELEASE_INFO.json`。

## 本版范围

继承 win.7 的 DCP、实际 LCP、RAW 候选解码器、ZR／HE／HE★、显存保护
和 WebGL 恢复。用户取消的预览分辨率档位任务没有恢复。既有 win.7
运行包与源码包均未修改；本版没有自动上传 GitHub。
