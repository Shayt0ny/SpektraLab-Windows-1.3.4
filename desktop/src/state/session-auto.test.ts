// Copyright (C) 2026 shayt0ny. SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { HelloResult } from '@shared/protocol';
import type { RenderReply } from '../host/client';
import type * as Session from './session';
import { newSidecar } from '@shared/sidecar';

const fake=vi.hoisted(()=>({renderView:vi.fn(),setParams:vi.fn(async()=>({})),close:vi.fn(async()=>{}),
  invoke:vi.fn(),
  frames:{print:null as RenderReply|null,original:null},logs:[] as string[]}));
vi.mock('../host/client',()=>({HostCallError:class extends Error{},host:()=>fake}));
vi.mock('@tauri-apps/api/core',()=>({invoke:fake.invoke}));
vi.mock('./frames',()=>({frameImages:fake.frames,makeThumbFromPrint:async()=>null,THUMB_EDGE:320}));
vi.mock('../platform',()=>({platform:()=>({log:(_level:string,message:string)=>fake.logs.push(message),
  sidecarSave:async()=>'',sidecarLoad:async()=>null}),baseName:(p:string)=>p,dirName:()=>'/owned'}));
function frame(flat?:number):RenderReply {
  const pixels=Array.from({length:256},(_,i)=>{const v=flat??[.04,.08,.12,.18,.25,.35][i%6]!;return[Math.round(v*255),Math.round(v*255),Math.round(v*255),255];}).flat();
  return{width:16,height:16,data:Uint8Array.from(pixels),format:'rgba8',colorSpace:'sRGB',tier:'live',reprinted:true,ms:1};
}
let session:typeof Session;
beforeEach(async()=>{
  vi.useFakeTimers();vi.resetModules();vi.clearAllMocks();vi.stubGlobal('window',{addEventListener:vi.fn()});
  fake.frames.print=null;fake.logs.length=0;fake.renderView.mockReset().mockResolvedValue(frame());
  session=await import('./session');
  const sidecar=newSidecar();sidecar.adjustments={...sidecar.adjustments,temperature:12,brightness:6};
  session.sessionStore.setState({selection:'/owned/frame.NEF',engineSession:'s1',picked:['/owned/frame.NEF'],sidecar,
    hello:{methods:['render_view']} as HelloResult,nativeSize:{width:16,height:16},hostState:{phase:'ready'} as never,
    developing:false,batchExporting:false,pair:null,tool:'select',undo:[],redo:[]});
  await session.requestPrint();fake.renderView.mockClear();
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});

describe('automatic grade action',()=>{
  it('sends only numeric grade context to AI and applies a reviewed proposal as one undo step',async()=>{
    const ai=await import('./ai');const before=structuredClone(session.sessionStore.getState().sidecar);
    fake.invoke.mockResolvedValue({summary:'Gentle lift',adjustments:{exposure:.3,highlights:-10}});
    const proposal=await ai.suggestGrade('openai','A little brighter');
    expect(fake.invoke).toHaveBeenCalledOnce();
    const[method,payload]=fake.invoke.mock.calls[0]!;expect(method).toBe('ai_suggest');
    expect(payload).toMatchObject({provider:'openai',prompt:'A little brighter'});
    expect(Object.keys(payload.context).sort()).toEqual(['adjustments','statistics']);
    expect(JSON.stringify(payload)).not.toContain('/owned');expect(JSON.stringify(payload)).not.toContain('frame.NEF');
    expect(session.sessionStore.getState().undo).toHaveLength(0);
    expect(ai.applyAiProposal(proposal)).toBe(true);expect(session.sessionStore.getState().undo).toHaveLength(1);
    expect(session.sessionStore.getState().sidecar.adjustments.exposure).toBe(.3);
    session.undo();expect(session.sessionStore.getState().sidecar.adjustments).toEqual(before.adjustments);
  });
  it('refuses an AI proposal after manual editing or changing the selected photo',async()=>{
    const ai=await import('./ai');const proposal={summary:'Lift',adjustments:{exposure:.3},stamp:ai.aiStamp()};
    session.setAdjustments(a=>({...a,brightness:4}));expect(ai.applyAiProposal(proposal)).toBe(false);
    expect(session.sessionStore.getState().sidecar.adjustments.exposure).toBe(0);
  });
  it('automatically builds an editable luma curve without changing other grade controls',async()=>{
    const before=structuredClone(session.sessionStore.getState().sidecar);
    await session.autoCurve();
    const state=session.sessionStore.getState();
    expect(state.sidecar.adjustments.curves.luma.points.length).toBeGreaterThan(2);
    expect({...state.sidecar.adjustments,curves:before.adjustments.curves}).toEqual(before.adjustments);
    expect(state.sidecar.params).toEqual(before.params);
    expect(state.undo).toHaveLength(1);
    const curve=structuredClone(state.sidecar.adjustments.curves);
    await session.autoCurve();
    expect(session.sessionStore.getState().sidecar.adjustments.curves).toEqual(curve);
    expect(session.sessionStore.getState().undo).toHaveLength(1);
    session.undo();expect(session.sessionStore.getState().sidecar.adjustments).toEqual(before.adjustments);
  });
  it('discards automatic curves when the frame is changed during analysis',async()=>{
    let release!:(value:RenderReply)=>void;
    fake.renderView.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const pending=session.autoCurve();
    session.sessionStore.setState({selection:'/owned/another.NEF'});
    release(frame());await pending;
    expect(session.sessionStore.getState().undo).toHaveLength(0);
  });
  it('does not disable auto for saved UI fields that do not change effective engine parameters',()=>{
    const s=session.sessionStore.getState();
    const params={...s.sidecar.params,futureUiChoice:true};
    session.sessionStore.setState({sidecar:{...s.sidecar,params}});
    expect(session.canAutoAdjust()).toBe(true);
  });
  it('applies once, preserves decode/film/manual controls and undoes as one action',async()=>{
    const before=structuredClone(session.sessionStore.getState().sidecar);
    expect(session.canAutoAdjust()).toBe(true);
    await session.autoAdjust();await vi.advanceTimersByTimeAsync(0);
    const state=session.sessionStore.getState();
    expect(state.sidecar.adjustments.exposure).toBeGreaterThan(0);
    expect(state.sidecar.adjustments).toMatchObject({temperature:12,brightness:6});
    expect(state.sidecar.params).toEqual(before.params);expect(state.sidecar.decode).toEqual(before.decode);
    expect(state.undo).toHaveLength(1);
    expect(fake.renderView.mock.calls[0]![2]).toMatchObject({long_edge:512,display:'srgb',adjustments:{exposure:0,temperature:12,brightness:6}});
    const applied=structuredClone(state.sidecar.adjustments);
    await session.autoAdjust();await vi.advanceTimersByTimeAsync(0);
    expect(session.sessionStore.getState().sidecar.adjustments).toEqual(applied);
    expect(session.sessionStore.getState().undo).toHaveLength(1);
    session.undo();expect(session.sessionStore.getState().sidecar.adjustments).toEqual(before.adjustments);
  });
  it('does not apply a late answer over a manual edit',async()=>{
    vi.advanceTimersByTime(600);
    let release!:(value:RenderReply)=>void;
    fake.renderView.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const pending=session.autoAdjust();expect(session.sessionStore.getState().autoAdjusting).toBe(true);
    session.setAdjustments(a=>({...a,exposure:-.8}));
    release(frame());await pending;
    expect(session.sessionStore.getState().sidecar.adjustments.exposure).toBe(-.8);
    expect(session.sessionStore.getState().undo).toHaveLength(1);
    expect(session.sessionStore.getState().autoAdjusting).toBe(false);
  });
  it('does not apply a late answer after selection or batch state changes',async()=>{
    let release!:(value:RenderReply)=>void;
    fake.renderView.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const pending=session.autoAdjust();
    session.sessionStore.setState({selection:'/owned/next.NEF',engineSession:'s2',batchExporting:true});
    release(frame());await pending;
    expect(session.sessionStore.getState().selection).toBe('/owned/next.NEF');
    expect(session.sessionStore.getState().sidecar.adjustments.exposure).toBe(0);
    expect(session.sessionStore.getState().undo).toHaveLength(0);
  });
  it('keeps all edits when both candidate checks add clipping',async()=>{
    const before=structuredClone(session.sessionStore.getState().sidecar);
    fake.renderView.mockResolvedValueOnce(frame()).mockResolvedValueOnce(frame(1)).mockResolvedValueOnce(frame(1));
    await session.autoAdjust();
    expect(session.sessionStore.getState().sidecar).toEqual(before);
    expect(session.sessionStore.getState().undo).toHaveLength(0);
    expect(fake.renderView).toHaveBeenCalledTimes(3);
    expect(session.sessionStore.getState().autoAdjustMessage).not.toBe('');
  });
  it('does not create an undo step for a flat frame or failed analysis',async()=>{
    fake.renderView.mockResolvedValueOnce(frame(.5));
    await session.autoAdjust();expect(session.sessionStore.getState().undo).toHaveLength(0);
    fake.renderView.mockRejectedValueOnce(new Error('analysis failed'));
    await session.autoAdjust();
    expect(session.sessionStore.getState().sidecar.adjustments.exposure).toBe(0);
    expect(session.sessionStore.getState().lastError).toContain('analysis failed');
  });
});
