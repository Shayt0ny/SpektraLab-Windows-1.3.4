# 核显共享内存分配修复

本轮针对其他用户提交的 Radeon 780M 报告：打开 P1012615.RW2，
请求 233 MiB，安全余量后仅剩 231 MiB。没有这台 780M 或这张原文件，
没有把维护者电脑的测试当成对方实机测试。尚未重新打包或发布。

## 已确认的软件缺陷

`engine/src/gpu/vulkan_gpu.cpp::create_buffer` 原先把计算缓冲区的
`DEVICE_LOCAL` 属性当成硬要求，并仅选择一个内存类型。该堆预算不足时
直接失败，没有尝试缓冲区 `memoryTypeBits` 允许的其他内存类型。

这个缺陷足以导致“小本地堆已满、兼容共享堆尚有空间”仍无法导入，
但不能仅凭任务管理器截图确认对方驱动一定提供所需兼容堆。
任务管理器显示的共享内存上限，不等于当前进程可随时分配的额度。
Vulkan 的预算按堆动态变化，必须按驱动返回的预算和兼容掩码判断：
[Khronos memory budget](https://docs.vulkan.org/refpages/latest/refpages/source/VkPhysicalDeviceMemoryBudgetPropertiesEXT.html)，
[Khronos UMA memory guide](https://docs.vulkan.org/guide/latest/memory_allocation.html)。

## 改动

- 计算内存优先本地堆；不足先回收零引用缓存，再尝试其他兼容堆。
- 共享内存仍由 GPU 执行原来的 Vulkan 计算，不是新增 CPU 渲染。
- 逐堆保留驱动预算、安全余量和 Windows commit 检查；不把不同堆的
  剩余空间相加来满足一个连续分配，不使用不兼容、受保护、惰性内存或
  未启用 AMD device-coherent 特性所要求的特殊类型。
- 驱动实际分配报内存不足时可继续尝试其他兼容类型；其他 Vulkan 错误
  保持失败，不盲目重试。已绑定的 staging 映射失败不会被错误重绑定。
- 诊断用计算内存限额按所有堆合计，不能靠共享回退绕过限额。
- 新增堆大小、内存类型、兼容堆拒绝信息和共享回退日志，便于核对 780M。
- 不降低 RAW、预览请求或导出分辨率，不改颜色、胶片模型或像素算法。

文件：`engine/src/gpu/vulkan_memory.hpp`、`vulkan_gpu.cpp`、
`engine/tests/gpu_vulkan_memory_types.cpp`、`engine/tests/host_uma.py`、
`engine/CMakeLists.txt`、`engine/WINDOWS_MEMORY.md`。

## 针对性验证

1. 人工重现旧的 device-local-only 规则：233 MiB 请求、231 MiB 本地可用、
   15 GiB 兼容共享可用时失败；新规则通过。
2. 覆盖本地优先、单堆不足不可拼凑、兼容位、受保护内存、cached staging、
   一体式 UMA 的 local+host-visible 类型。
3. RTX 5070 的真实 Vulkan：正常及强制本地预算 1 MiB 两种模式下，
   64 MiB 计算限额、缓存回收、正确拒绝和恢复全部通过。
4. 强制共享堆的原生 view 检查通过：精度、缩小采样、调色／几何、校样、
   DI、缓存与临时驻留恢复。没有运行全量测试。
5. 维护者现有 2500 万像素 RW2：本地预算 1 MiB 时仍可打开，源图、胶片、
   校样与正常路径逐字节相同；校样验证的原生文件尺寸保持 4344×5784。

复测：

```powershell
cmake --build build/beta --target spektralab-host spk_vulkan_memory_types spk_vulkan_memory spk_vulkan_view -j6
build/beta/engine/spk_vulkan_memory_types.exe
build/beta/engine/spk_vulkan_memory.exe build/beta/engine/resources
$env:SPEKTRAFILM_TEST_VULKAN_LOCAL_BUDGET_MB='1'
build/beta/engine/spk_vulkan_memory.exe build/beta/engine/resources
build/beta/engine/spk_vulkan_view.exe build/beta/engine/resources
Remove-Item Env:SPEKTRAFILM_TEST_VULKAN_LOCAL_BUDGET_MB
python engine/tests/host_uma.py --host build/beta/engine/host/spektralab-host.exe --resources build/beta/engine/resources --raw '你的测试照片.RW2'
```

`SPEKTRAFILM_TEST_VULKAN_LOCAL_BUDGET_MB` 只能压低预算，供开发验证，
不是用户启动参数。真实 780M 仍需用其驱动／照片复测；若驱动没有提供
兼容共享类型，或所有兼容堆和系统 commit 均不足，仍应明确报错。
