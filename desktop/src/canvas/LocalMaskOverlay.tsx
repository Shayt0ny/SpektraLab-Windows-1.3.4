import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {outputPoint,sourcePoint,type Point} from '@shared/geometry';
import {maskCoverage,rasterizeBrush,type LocalMask} from '@shared/localMasks';
import {useSession,sessionStore,beginGesture} from '../state/session';
import {canEditMasks,changeMask,maskUi,useMaskUi} from '../state/localMasks';
import type {Layout} from './Canvas';
interface Drag{frame:string|null;id:string;points:Point[];handle:'start'|'end'|null;mask:LocalMask}
export function LocalMaskOverlay({layout,dpr}:{layout:Layout;dpr:number}){
  const ui=useMaskUi(s=>s),masks=useSession(s=>s.sidecar.adjustments.localMasks),selection=useSession(s=>s.selection),mask=masks?.find(m=>m.id===ui.selected);
  const ref=useRef<SVGSVGElement>(null),drag=useRef<Drag|null>(null),[draft,setDraft]=useState<Drag|null>(null);
  const clipId=useId();
  useEffect(()=>{drag.current=null;setDraft(null);},[selection]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){drag.current=null;setDraft(null);maskUi.setState({editing:false});}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const preview=useMemo(()=>{
    if(!mask||!ui.overlay||!mask.enabled)return null;
    const w=384,h=Math.max(1,Math.round(w*layout.native.height/layout.native.width)),raster=mask.kind==='brush'?rasterizeBrush(mask,layout.native.width/layout.native.height):undefined;
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)return null;const image=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;image.data[i]=255;image.data[i+1]=55;image.data[i+2]=55;image.data[i+3]=Math.round(maskCoverage(mask,{x:(x+.5)/w,y:(y+.5)/h},raster)*85);}
    ctx.putImageData(image,0,0);return canvas.toDataURL();
  },[mask,ui.overlay,layout.native.width,layout.native.height]);
  const toView=(p:Point)=>{const q=outputPoint(layout.display,p,layout.native);return{x:(layout.offset.x+q.x*layout.outSize.width)/dpr,y:(layout.offset.y+q.y*layout.outSize.height)/dpr};};
  const toSource=(e:React.PointerEvent)=>{const r=ref.current!.getBoundingClientRect();return sourcePoint(layout.display,{x:((e.clientX-r.left)*dpr-layout.offset.x)/layout.outSize.width,y:((e.clientY-r.top)*dpr-layout.offset.y)/layout.outSize.height},layout.native);};
  if(!mask||!ui.editing||!canEditMasks())return null;
  const origin=toView({x:0,y:0}),x=toView({x:1,y:0}),y=toView({x:0,y:1});
  const transform=`matrix(${x.x-origin.x} ${x.y-origin.y} ${y.x-origin.x} ${y.y-origin.y} ${origin.x} ${origin.y})`;
  const a=toView(mask.start),b=toView(mask.end),points=draft?.points??[];
  const end=(e:React.PointerEvent)=>{
    e.stopPropagation();const d=drag.current;drag.current=null;setDraft(null);
    if(!d||d.frame!==sessionStore.getState().selection||d.id!==mask.id)return;
    const last=d.points.at(-1)!;beginGesture();
    changeMask(d.id,m=>{
      if(m.kind==='brush'){if(m.strokes.length>=128)return m;return{...m,strokes:[...m.strokes,{points:d.points,radius:m.radius,erase:ui.erase}]};}
      if(d.handle==='start'&&m.kind==='radial'){const dx=last.x-m.start.x,dy=last.y-m.start.y;return{...m,start:last,end:{x:Math.max(0,Math.min(1,m.end.x+dx)),y:Math.max(0,Math.min(1,m.end.y+dy))}};}
      return d.handle?{...m,[d.handle]:last}:{...m,start:d.points[0]!,end:last};
    });
  };
  return <svg ref={ref} className="local-mask-overlay" width="100%" height="100%" data-testid="local-mask-overlay" onPointerDown={e=>{
    if(e.button!==0)return;e.stopPropagation();const rect=ref.current!.getBoundingClientRect(),vx=(e.clientX-rect.left)*dpr,vy=(e.clientY-rect.top)*dpr;
    if(vx<layout.offset.x||vy<layout.offset.y||vx>layout.offset.x+layout.outSize.width||vy>layout.offset.y+layout.outSize.height)return;
    const p=toSource(e);if(p.x<0||p.y<0||p.x>1||p.y>1)return;ref.current!.setPointerCapture(e.pointerId);
    const target=(e.target as SVGElement).dataset.handle as 'start'|'end'|undefined;
    const d:Drag={frame:selection,id:mask.id,points:[p],handle:target??null,mask};drag.current=d;setDraft(d);
  }} onPointerMove={e=>{const d=drag.current;if(!d)return;e.stopPropagation();const p=toSource(e);p.x=Math.max(0,Math.min(1,p.x));p.y=Math.max(0,Math.min(1,p.y));
    const next={...d,points:d.points.length<1024?[...d.points,p]:d.points};drag.current=next;setDraft(next);
  }} onPointerUp={end} onPointerCancel={e=>{e.stopPropagation();drag.current=null;setDraft(null);}}>
    <rect width="100%" height="100%" fill="transparent" pointerEvents="all"/>
    <defs><clipPath id={clipId}><rect x={layout.offset.x/dpr} y={layout.offset.y/dpr} width={layout.outSize.width/dpr} height={layout.outSize.height/dpr}/></clipPath></defs>
    {preview&&<g clipPath={`url(#${clipId})`} pointerEvents="none"><g transform={transform}><image href={preview} x="0" y="0" width="1" height="1" preserveAspectRatio="none"/></g></g>}
    {mask.kind!=='brush'&&<><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="white" strokeWidth="1.5" strokeDasharray="5 3"/>
      <circle data-handle="start" cx={a.x} cy={a.y} r="6" fill="var(--accent)" stroke="white"/><circle data-handle="end" cx={b.x} cy={b.y} r="6" fill="var(--card)" stroke="white"/></>}
    {points.length>0&&<polyline points={(mask.kind==='brush'?points:[points[0]!,points.at(-1)!]).map(p=>{const v=toView(p);return`${v.x},${v.y}`;}).join(' ')} fill="none" stroke={ui.erase?'white':'#ff5555'} strokeOpacity=".6" strokeWidth={mask.kind==='brush'?Math.max(2,mask.radius*2*Math.min(layout.outSize.width,layout.outSize.height)/dpr):2} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/>}
  </svg>;
}
