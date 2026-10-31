import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import {sessionStore,setAdjustments,beginGesture,setTool} from './session';
import {newLocalMask,decodeLocalMasks,MAX_MASKS,type LocalMask,type MaskKind} from '@shared/localMasks';
export interface MaskUi{selected:string|null;editing:boolean;overlay:boolean;erase:boolean}
export const maskUi=createStore<MaskUi>(()=>({selected:null,editing:false,overlay:true,erase:false}));
sessionStore.subscribe((next,previous)=>{if(next.selection!==previous.selection)maskUi.setState({selected:null,editing:false,erase:false});});
export const useMaskUi=<T,>(fn:(s:MaskUi)=>T)=>useStore(maskUi,fn);
export function canEditMasks(){const s=sessionStore.getState();return !!s.selection&&!!s.engineSession&&!!s.badge&&s.hello?.view_options?.includes('local_masks')===true&&!s.batchExporting&&!s.redecoding&&!s.developing&&!s.pair;}
export function changeMasks(fn:(m:LocalMask[])=>LocalMask[]){if(!canEditMasks())return;try{setAdjustments(a=>({...a,localMasks:decodeLocalMasks(fn(a.localMasks??[]))}));}catch(error){sessionStore.setState({status:String(error)});}}
export function changeMask(id:string,fn:(m:LocalMask)=>LocalMask){changeMasks(masks=>masks.map(m=>m.id===id?fn(m):m));}
export function addMask(kind:MaskKind){if(!canEditMasks())return;const current=sessionStore.getState().sidecar.adjustments.localMasks??[];if(current.length>=MAX_MASKS)return;
  const id=crypto.randomUUID(),m=newLocalMask(kind,id);beginGesture();changeMasks(masks=>[...masks,m]);
  setTool('select');sessionStore.setState({showingOriginal:false,comparing:false});maskUi.setState({selected:id,editing:true,overlay:true,erase:false});
}
