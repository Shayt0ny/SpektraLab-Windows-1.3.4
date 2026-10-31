// Local Post-Dev regions. Coordinates are normalized on the complete print
// before its display crop/rotation. Brush rasters are derived, never saved.
export type MaskKind='linear'|'radial'|'brush';
export interface MaskPoint{x:number;y:number}
export const LOCAL_GRADE_DEFAULT={exposure:0,contrast:0,brightness:0,saturation:0,temperature:0,tint:0,highlights:0,shadows:0};
export type LocalGrade=typeof LOCAL_GRADE_DEFAULT;
export interface BrushStroke{points:MaskPoint[];radius:number;erase:boolean}
export interface LocalMask{
  id:string;name:string;kind:MaskKind;enabled:boolean;amount:number;inverted:boolean;feather:number;
  start:MaskPoint;end:MaskPoint;radius:number;strokes:BrushStroke[];adjustments:LocalGrade;
}
export const MAX_MASKS=8;
export function newLocalMask(kind:MaskKind,id:string):LocalMask{return{id,name:'',kind,enabled:true,amount:1,inverted:false,feather:.5,
  start:{x:.3,y:.3},end:{x:.7,y:.7},radius:.06,strokes:[],adjustments:{...LOCAL_GRADE_DEFAULT}};}
export function decodeLocalMasks(raw:unknown):LocalMask[]{
  if(raw===undefined)return[];
  if(!Array.isArray(raw)||raw.length>MAX_MASKS)throw Error('Invalid local masks / 局部蒙版数据无效');
  let total=0;const ids=new Set<string>();
  const num=(v:unknown,lo:number,hi:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw Error('Invalid mask value / 蒙版数值无效');return v;};
  const point=(v:unknown):MaskPoint=>{const p=v as MaskPoint;return{x:num(p?.x,0,1),y:num(p?.y,0,1)};};
  return raw.map(v=>{
    const m=v as LocalMask;
    if(!m||typeof m.id!=='string'||!m.id||m.id.length>80||ids.has(m.id)||!['linear','radial','brush'].includes(m.kind)||typeof m.name!=='string'||m.name.length>100||typeof m.enabled!=='boolean'||typeof m.inverted!=='boolean')throw Error('Invalid local mask / 局部蒙版数据无效');
    ids.add(m.id);
    if(!Array.isArray(m.strokes)||m.strokes.length>128)throw Error('Too many brush strokes / 画笔笔画过多');
    const strokes=m.strokes.map(s=>{if(!s||!Array.isArray(s.points)||!s.points.length||s.points.length>1024||typeof s.erase!=='boolean')throw Error('Invalid brush stroke / 画笔笔画无效');total+=s.points.length;if(total>8192)throw Error('Brush point limit reached / 画笔点数已达上限');return{points:s.points.map(point),radius:num(s.radius,.002,.4),erase:s.erase};});
    const adjustments={...LOCAL_GRADE_DEFAULT};for(const k of Object.keys(adjustments)as(keyof LocalGrade)[]){const range=k==='exposure'?3:k==='contrast'||k==='brightness'?50:100;adjustments[k]=num(m.adjustments?.[k],-range,range);}
    return{id:m.id,name:m.name,kind:m.kind,enabled:m.enabled,inverted:m.inverted,amount:num(m.amount,0,1),feather:num(m.feather,0,1),start:point(m.start),end:point(m.end),radius:num(m.radius,.002,.4),strokes,adjustments};
  });
}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/Math.max(b-a,1e-6));return t*t*(3-2*t);};
export interface BrushRaster{width:number;height:number;data:Float32Array}
export function rasterizeBrush(mask:LocalMask,aspect:number,longEdge=1024):BrushRaster{
  const width=Math.max(1,Math.round(aspect>=1?longEdge:longEdge*aspect)),height=Math.max(1,Math.round(aspect>=1?longEdge/aspect:longEdge));
  const data=new Float32Array(width*height),short=Math.min(width,height);
  const stamp=(p:MaskPoint,radius:number,erase:boolean)=>{
    const radiusPx=radius*short,x=p.x*width,y=p.y*height;
    for(let yy=Math.max(0,Math.floor(y-radiusPx));yy<Math.min(height,Math.ceil(y+radiusPx));yy++)for(let xx=Math.max(0,Math.floor(x-radiusPx));xx<Math.min(width,Math.ceil(x+radiusPx));xx++){
      const d=Math.hypot(xx+.5-x,yy+.5-y)/radiusPx,c=1-smooth(Math.max(0,1-mask.feather),1,d),i=yy*width+xx;
      data[i]=erase?Math.min(data[i]!,1-c):Math.max(data[i]!,c);
    }
  };
  for(const stroke of mask.strokes){
    stamp(stroke.points[0]!,stroke.radius,stroke.erase);
    for(let i=1;i<stroke.points.length;i++){const a=stroke.points[i-1]!,b=stroke.points[i]!,distance=Math.hypot((b.x-a.x)*width,(b.y-a.y)*height),steps=Math.max(1,Math.ceil(distance/Math.max(1,stroke.radius*short*.3)));
      for(let j=1;j<=steps;j++)stamp({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps},stroke.radius,stroke.erase);}
  }
  return{width,height,data};
}
export function maskCoverage(m:LocalMask,p:MaskPoint,raster?:BrushRaster):number{
  if(!m.enabled)return 0;let c=0;
  if(m.kind==='linear'){const dx=m.end.x-m.start.x,dy=m.end.y-m.start.y,len=dx*dx+dy*dy;
    if(len<1e-8)return 0;const t=((p.x-m.start.x)*dx+(p.y-m.start.y)*dy)/len;c=1-smooth((1-m.feather)*.5,(1+m.feather)*.5,t);
  }else if(m.kind==='radial'){const rx=Math.max(.005,Math.abs(m.end.x-m.start.x)),ry=Math.max(.005,Math.abs(m.end.y-m.start.y));c=1-smooth(Math.max(0,1-m.feather),1,Math.hypot((p.x-m.start.x)/rx,(p.y-m.start.y)/ry));
  }else if(raster){const x=clamp(p.x)*raster.width-.5,y=clamp(p.y)*raster.height-.5,x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
    const read=(xx:number,yy:number)=>raster.data[Math.max(0,Math.min(raster.height-1,yy))*raster.width+Math.max(0,Math.min(raster.width-1,xx))]!;
    c=(read(x0,y0)*(1-fx)+read(x0+1,y0)*fx)*(1-fy)+(read(x0,y0+1)*(1-fx)+read(x0+1,y0+1)*fx)*fy;
  }
  return clamp((m.inverted?1-c:c)*m.amount);
}
