import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {newSidecar} from '@shared/sidecar';
import type {HelloResult} from '@shared/protocol';
vi.mock('../host/client',()=>({HostCallError:class extends Error{},host:()=>({})}));
vi.mock('../platform',()=>({platform:()=>({sidecarSave:async()=>'',log:()=>{}}),baseName:(s:string)=>s,dirName:(s:string)=>s}));
import {sessionStore,beginGesture,undo} from './session';
import {addMask,canEditMasks,changeMask,maskUi} from './localMasks';
beforeEach(()=>{vi.useFakeTimers();sessionStore.setState({sidecar:structuredClone(newSidecar()),selection:'/owned/a.png',engineSession:'a',badge:'full',
  hello:{methods:[],view_options:['local_masks']}as unknown as HelloResult,developing:false,redecoding:false,batchExporting:false,pair:null,undo:[],redo:[]});});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
it('each stroke/region edit is an atomic undo and selection clears the active drawing tool',()=>{
  addMask('linear');const m=sessionStore.getState().sidecar.adjustments.localMasks![0]!;expect(maskUi.getState().selected).toBe(m.id);
  beginGesture();changeMask(m.id,q=>({...q,start:{x:.1,y:.2}}));expect(sessionStore.getState().undo.length).toBe(2);
  undo();expect(sessionStore.getState().sidecar.adjustments.localMasks![0]!.start).toEqual(m.start);
  sessionStore.setState({selection:'/owned/b.png'});expect(maskUi.getState()).toMatchObject({editing:false,selected:null});
});
it('refuses edits during batch export and on unsupported hosts',()=>{
  for(const patch of [{batchExporting:true},{developing:true},{redecoding:true},{hello:{view_options:[]}as unknown as HelloResult}]){
    const before=sessionStore.getState();sessionStore.setState(patch);expect(canEditMasks()).toBe(false);addMask('brush');expect(sessionStore.getState().sidecar.adjustments.localMasks).toBeUndefined();sessionStore.setState(before);
  }
});
it('caps masks without discarding previous regions',()=>{
  for(let i=0;i<10;i++)addMask('radial');expect(sessionStore.getState().sidecar.adjustments.localMasks!.length).toBe(8);
});
