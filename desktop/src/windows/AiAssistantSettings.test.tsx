// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {defaultAiSettings} from '@shared/ai';
const fake=vi.hoisted(()=>({invoke:vi.fn(),suggest:vi.fn(),apply:vi.fn(),stamp:'one'}));
vi.mock('@tauri-apps/api/core',()=>({invoke:fake.invoke}));
vi.mock('../host/transport',()=>({inTauri:()=>true}));
vi.mock('../state/ai',()=>({suggestGrade:fake.suggest,applyAiProposal:fake.apply,aiStamp:()=>fake.stamp}));
vi.mock('../state/session',()=>({canAutoAdjust:()=>true,useSession:(fn:(s:unknown)=>unknown)=>fn({sidecar:{adjustments:{exposure:0}}})}));
vi.mock('../i18n',()=>({tz:(s:string)=>s}));
import {AiAssistantSettings} from './AiAssistantSettings';
let root:Root,div:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.clearAllMocks();div=document.createElement('div');document.body.append(div);root=createRoot(div);
  fake.invoke.mockImplementation(async(name:string)=>name==='ai_settings_get'?defaultAiSettings():defaultAiSettings());});
afterEach(async()=>{await act(async()=>root.unmount());div.remove();vi.unstubAllGlobals();});
const button=(text:string)=>[...div.querySelectorAll('button')].find(b=>b.textContent===text)!;
it('opens without connecting, masks keys and selects the provider default',async()=>{
  await act(async()=>root.render(<AiAssistantSettings/>));expect(fake.invoke.mock.calls.map(c=>c[0])).toEqual(['ai_settings_get']);
  expect(div.querySelector('input[type=password]')).not.toBeNull();expect(button('Test connection').disabled).toBe(true);
  await act(async()=>{const select=div.querySelector('select')!;select.value='deepseek';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(div.textContent).toContain('https://api.deepseek.com');expect((div.querySelector('input:not([type=password])')as HTMLInputElement).value).toBe('deepseek-flash');
});
it('generates a reviewable suggestion and applies it only when the user presses apply',async()=>{
  const settings=defaultAiSettings();settings.profiles.openai.has_key=true;fake.invoke.mockResolvedValue(settings);
  fake.suggest.mockResolvedValue({summary:'Softer highlights',adjustments:{exposure:.3},stamp:'one'});fake.apply.mockReturnValue(true);
  await act(async()=>root.render(<AiAssistantSettings/>));
  await act(async()=>{const area=div.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,'A little brighter');area.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Generate suggestion').click());expect(fake.apply).not.toHaveBeenCalled();expect(div.textContent).toContain('Softer highlights');
  await act(async()=>button('Apply to current photo').click());expect(fake.apply).toHaveBeenCalledOnce();expect(button('Applied').disabled).toBe(true);
});
