# Spektra Studio · Windows 1.3.4-win.9

“工作室”的英文是 Studio。此版本沿用原有用户数据标识和引擎协议，保留已有
编辑、设置、CLI 与第三方版权署名，界面、窗口和安装产品名改为 Spektra Studio。

## 界面

统一中英文系统字体、字号、行距、标签列与数字框，增大输入框和按钮的有效高度。
设置改为左侧分类、右侧独立滚动，分组不再因侧栏 flex 布局被压缩。覆盖
中英文 100% / 115% / 130% 缩放以及 1100×680 的窗口。

## 自动明度曲线

显影后 → 曲线 → 自动明度曲线。分析一张 512 px 的原生渲染预览，生成可编辑的
明度曲线；保留其余色彩曲线、曝光、白平衡、胶片和相纸设置。每次从该曲线的
恒等基线测量，避免重复点击叠加。候选曲线须经过真实原生渲染检查，不增加
明显截断；片边区域通过引擎片窗几何排除。一次 Ctrl+Z 撤销，分析途中换图或
手动编辑会丢弃过时结果。

## OpenAI / DeepSeek

工具栏 AI 或设置 → AI 助手。选择服务商、填写 API Key、保存并测试；模型名
放在可选设置里。OpenAI 与 DeepSeek 分别保存密钥。

只有用户点击测试／生成时才发送请求，目的地址固定为 `api.openai.com` 或
`api.deepseek.com`，不接受重定向或第三方接口。测试仅发送简短连通性文字；
生成建议仅发送用户描述、十个显影后调色数值和明暗统计，不发送照片、EXIF
或文件路径。模型看不到照片，结果基于文字和统计；页面明确说明这一点。

密钥与配置由 Windows 当前用户的 DPAPI 加密存储于应用数据的
`AI/connection.dpapi`。不会将密钥返回给前端、放入 localStorage 或诊断包。
模型返回内容只允许受范围限制的调色数值；没有执行代码、删除、导出或自主
文件操作能力。用户先查看说明与参数差异，再点击应用；能一次撤销。

原有 MCP / CLI 入口保留在“高级 · 外部智能体与命令行”，其本地访问开关
不受 API 连接影响。

默认模型：OpenAI `gpt-5.6-terra`、DeepSeek `deepseek-flash`，可按账户权限修改。
接口依据：
- <https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create>
- <https://developers.openai.com/api/docs/models/gpt-5.6-terra>
- <https://api-docs.deepseek.com/quick_start/agent_integrations/>

## 验证

前端类型检查、469 项单元测试、19 项浏览器交互和布局测试通过；1 项需要
外部原生测试环境的前端测试跳过。Rust 原生 28 项通过，另有 1 项子进程夹具
按设计忽略。包含两个服务商的请求／响应契约、错误数据拒绝、密钥不泄露和
实际 Windows DPAPI 加解密及损坏检查。未使用真实账户密钥进行云端调用，
实际账户的额度、模型权限和网络需通过页面的“测试连接”确认。

本版继承 EOS R6 Mark III ColorData66 黑／白电平修复；未修改胶片或相纸模型。
