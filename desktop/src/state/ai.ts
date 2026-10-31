import {invoke} from '@tauri-apps/api/core';
import {AI_RANGES,type AiControl,type AiProposal,type AiProvider,validateAiProposal} from '@shared/ai';
import {toneStatistics,insetAutoRegion,type AutoRegion} from '@shared/autoAdjust';
import {canvasGeometryFor,sourceGeometryFor,edgeEffective} from '@shared/filmEdge';
import {GEOMETRY_DEFAULT} from '@shared/geometry';
import {sessionStore,canAutoAdjust,setAdjustments,beginGesture} from './session';
import {host} from '../host/client';
import {tz} from '../i18n';
export interface PendingAiProposal extends AiProposal{stamp:string}
export function aiStamp():string{
  const s=sessionStore.getState();return JSON.stringify([s.selection,s.engineSession,s.sidecar,s.pair,s.pairLayer]);
}
export async function suggestGrade(provider:AiProvider,prompt:string):Promise<PendingAiProposal>{
  if(!canAutoAdjust())throw Error(tz('Wait for the photo to finish rendering.','请等待照片渲染完成。'));
  const stamp=aiStamp(),s=sessionStore.getState();
  const current=()=>stamp===aiStamp()&&canAutoAdjust();
  const image=await host().renderView(s.engineSession!,'live',{
    adjustments:s.sidecar.adjustments,geometry:canvasGeometryFor(s.sidecar.params,s.sidecar.geometry,s.gate,s.sidecar.noFilm),
    source_geometry:sourceGeometryFor(s.sidecar.params,s.sidecar.geometry,s.gate,s.sidecar.noFilm)??GEOMETRY_DEFAULT,
    ...(s.sidecar.noFilm?{no_film:true}:{}),display:'srgb',long_edge:512,generation:1_200_000_000,
  });
  let regions:AutoRegion[]|undefined;
  if(edgeEffective(s.sidecar.params.filmEdge,s.gate,s.sidecar.noFilm)){
    const layout=await host().overscanGeometry(s.engineSession!);
    if(!layout.valid||!layout.gates?.length)throw Error(tz('Picture boundaries are not ready.','画面范围尚未准备完成。'));
    regions=layout.gates.map(g=>{if(g.length!==8)throw Error('Invalid film gate geometry');return insetAutoRegion(Array.from({length:4},(_,i)=>[g[i*2]!,g[i*2+1]!]as const));});
  }
  if(!current())throw Error(tz('The photo changed. Generate a new suggestion.','照片已变化，请重新生成建议。'));
  const adjustments=Object.fromEntries((Object.keys(AI_RANGES)as AiControl[]).map(k=>[k,s.sidecar.adjustments[k]]));
  // No file names, metadata, paths or pixel payloads cross this boundary.
  const result=await invoke<unknown>('ai_suggest',{provider,prompt,context:{adjustments,statistics:toneStatistics(image,regions)}});
  if(!current())throw Error(tz('The photo changed. Generate a new suggestion.','照片已变化，请重新生成建议。'));
  return{...validateAiProposal(result),stamp};
}
export function applyAiProposal(proposal:PendingAiProposal):boolean{
  if(proposal.stamp!==aiStamp()||!canAutoAdjust())return false;
  const checked=validateAiProposal({summary:proposal.summary,adjustments:proposal.adjustments});
  beginGesture();setAdjustments(a=>({...a,enabled:true,...checked.adjustments}));return true;
}
