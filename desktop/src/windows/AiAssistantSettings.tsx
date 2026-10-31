import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {AI_PROVIDERS,defaultAiSettings,type AiProvider,type AiSettings,type AiControl} from '@shared/ai';
import {suggestGrade,applyAiProposal,aiStamp,type PendingAiProposal} from '../state/ai';
import {canAutoAdjust,useSession} from '../state/session';
import {inTauri} from '../host/transport';
import {tz} from '../i18n';
const labels:Record<AiControl,()=>string>={exposure:()=>tz('Exposure','曝光'),contrast:()=>tz('Contrast','对比度'),brightness:()=>tz('Brightness','亮度'),
  saturation:()=>tz('Saturation','饱和度'),highlights:()=>tz('Highlights','高光'),shadows:()=>tz('Shadows','阴影'),temperature:()=>tz('Temperature offset','色温偏移'),tint:()=>tz('Tint offset','色调偏移'),blackPoint:()=>tz('Black point','黑场'),whitePoint:()=>tz('White point','白场')};
export function AiAssistantSettings(){
  const[settings,setSettings]=useState<AiSettings>(defaultAiSettings),[provider,setProvider]=useState<AiProvider>('openai');
  const[model,setModel]=useState<string>(AI_PROVIDERS.openai.model),[key,setKey]=useState(''),[loaded,setLoaded]=useState(false);
  const[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[prompt,setPrompt]=useState('');
  const[proposal,setProposal]=useState<PendingAiProposal|null>(null),[applied,setApplied]=useState(false);
  const alive=useRef(true),ready=useSession(()=>canAutoAdjust()),stamp=useSession(()=>aiStamp());
  const currentGrade=useSession(s=>s.sidecar.adjustments);
  useEffect(()=>{alive.current=true;if(inTauri())void invoke<AiSettings>('ai_settings_get').then(s=>{
    if(!alive.current)return;if(s?.profiles){setSettings(s);setProvider(s.active);setModel(s.profiles[s.active].model);}setLoaded(true);
  }).catch(e=>{if(alive.current){setError(String(e));setLoaded(true);}});return()=>{alive.current=false;};},[]);
  const action=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn();}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}};
  const save=async()=>{
    const s=await invoke<AiSettings>('ai_settings_save',{connection:{provider,model,api_key:key}});
    if(!alive.current)return s;setSettings(s);setKey('');setNotice(tz('Connection saved.','连接已保存。'));return s;
  };
  const profile=settings.profiles[provider],changed=model!==profile.model||!!key;
  const connected=profile.has_key&&!changed;
  return <>
    <div className="settings-group" data-testid="ai-connection">
      <h3>{tz('Connect your AI','连接你的 AI')}</h3>
      <p className="caption">{tz('Choose OpenAI or DeepSeek, paste an API Key, then save and test. Each service keeps its own key.','选择 OpenAI 或 DeepSeek，填写 API Key，保存并测试。两个服务分别保存密钥。')}</p>
      <label className="settings-field">{tz('Provider','服务商')}
        <select value={provider} disabled={busy} onChange={e=>{const p=e.target.value as AiProvider;setProvider(p);setModel(settings.profiles[p].model);setKey('');setNotice('');setError('');setProposal(null);}}>
          <option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option>
        </select>
      </label>
      <p className="caption mono">{AI_PROVIDERS[provider].address}</p>
      <label className="settings-field">API Key
        <input type="password" autoComplete="off" spellCheck={false} value={key} disabled={busy||!loaded}
          placeholder={profile.has_key?tz('Saved securely · leave blank to keep','已安全保存 · 留空保留'):tz('Paste your API Key','粘贴你的 API Key')} onChange={e=>setKey(e.target.value)}/>
      </label>
      <details><summary>{tz('Model settings (optional)','模型设置（可选）')}</summary>
      <label className="settings-field">{tz('Model','模型')}
        <input value={model} disabled={busy} spellCheck={false} onChange={e=>setModel(e.target.value)}/>
      </label>
      </details>
      <div className="settings-actions">
        <button className="btn primary" disabled={busy||!loaded||!model.trim()||(!key.trim()&&!profile.has_key)} onClick={()=>void action(async()=>{await save();})}>{tz('Save connection','保存连接')}</button>
        <button className="btn" disabled={busy||!loaded||!model.trim()||(!key.trim()&&!profile.has_key)} onClick={()=>void action(async()=>{await save();await invoke('ai_connection_test',{provider});if(alive.current)setNotice(tz('Connected successfully.','连接成功。'));})}>{busy?tz('Working…','处理中…'):tz('Test connection','测试连接')}</button>
        {profile.has_key&&<button className="btn" disabled={busy} onClick={()=>void action(async()=>{const s=await invoke<AiSettings>('ai_key_remove',{provider});if(alive.current){setSettings(s);setKey('');setProposal(null);setNotice(tz('API Key removed.','API Key 已移除。'));}})}>{tz('Remove key','移除密钥')}</button>}
      </div>
      <p className="caption">{tz('Keys are encrypted for your Windows account. Requests go only to the selected official service when you press Test or Generate.','密钥由 Windows 账户加密保存。只有点击“测试”或“生成”时才会请求所选服务的官方接口。')}</p>
      {!inTauri()&&<p className="settings-status">{tz('AI connections are available in the Windows desktop app.','请在 Windows 桌面应用中连接 AI。')}</p>}
    </div>
    <div className="settings-group" data-testid="ai-grading">
      <h3>{tz('Describe the look','描述你想要的效果')}</h3>
      <label className="settings-field">{tz('Grading request','调色描述')}
        <textarea value={prompt} maxLength={2000} disabled={busy} placeholder={tz('For example: softer highlights, warmer colours, keep skin tones natural.','例如：高光柔和一点，整体偏暖，肤色保持自然。')} onChange={e=>setPrompt(e.target.value)}/>
      </label>
      <p className="caption">{tz('Sends only your description, current grading values and tonal statistics. No photo or file path is uploaded. AI cannot see the image; describe its content when relevant.','只发送你的描述、当前调色数值和明暗统计，不上传照片或文件路径。AI 看不到画面，需要时请描述照片内容。')}</p>
      <button className="btn primary" disabled={busy||!ready||!connected||!prompt.trim()} onClick={()=>void action(async()=>{setProposal(null);setApplied(false);const p=await suggestGrade(provider,prompt);if(alive.current)setProposal(p);})}>{busy?tz('Working…','处理中…'):tz('Generate suggestion','生成调色建议')}</button>
      {!ready&&<p className="caption">{tz('Open a photo and wait for its preview before generating a suggestion.','打开照片并等待预览完成后，即可生成建议。')}</p>}
      {changed&&<p className="caption">{tz('Save the connection before generating.','请先保存连接，再生成建议。')}</p>}
      {proposal&&<div className="ai-proposal" data-testid="ai-proposal">
        <p>{proposal.summary}</p>
        <dl className="caption">{Object.entries(proposal.adjustments).map(([k,v])=><div key={k} style={{display:'contents'}}><dt>{labels[k as AiControl]()}</dt><dd>{currentGrade[k as AiControl]} → {v}</dd></div>)}</dl>
        <button className="btn primary" disabled={busy||!ready||applied||proposal.stamp!==stamp||!Object.keys(proposal.adjustments).length} onClick={()=>{
          if(applyAiProposal(proposal)){setApplied(true);setNotice(tz('Applied · Ctrl+Z to undo.','已应用 · Ctrl+Z 撤销。'));}
          else setError(tz('The photo changed. Generate again.','照片已变化，请重新生成。'));
        }}>{applied?tz('Applied','已应用'):tz('Apply to current photo','应用到当前照片')}</button>
        {!applied&&proposal.stamp!==stamp&&<p className="caption">{tz('Photo or edits changed. Generate a new suggestion.','照片或编辑已变化，请重新生成建议。')}</p>}
      </div>}
    </div>
    {notice&&<p className="settings-status" role="status">{notice}</p>}
    {error&&<p className="settings-status" role="alert">{error}</p>}
  </>;
}
