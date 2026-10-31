import {Section,ScrubSlider,ToggleRow} from '../controls/controls';
import {useSession,beginGesture} from '../state/session';
import {addMask,changeMask,changeMasks,canEditMasks,maskUi,useMaskUi} from '../state/localMasks';
import {MAX_MASKS,type LocalGrade,type LocalMask,type MaskKind} from '@shared/localMasks';
import {tz} from '../i18n';
export const maskKindName=(kind:MaskKind)=>kind==='linear'?tz('Linear gradient','线性渐变'):kind==='radial'?tz('Radial gradient','圆形渐变'):tz('Brush','画笔');
const EMPTY_MASKS:LocalMask[]=[];
export function LocalMasksSection(){
  const masks=useSession(s=>s.sidecar.adjustments.localMasks??EMPTY_MASKS),ready=useSession(()=>canEditMasks());
  const ui=useMaskUi(s=>s),selected=masks.find(m=>m.id===ui.selected);
  const controls:[keyof LocalGrade,string,number][]=[['exposure',tz('Exposure','曝光'),3],['contrast',tz('Contrast','对比度'),50],['brightness',tz('Brightness','亮度'),50],['highlights',tz('Highlights','高光'),100],['shadows',tz('Shadows','阴影'),100],['temperature',tz('Temperature','色温'),100],['tint',tz('Tint','色调'),100],['saturation',tz('Saturation','饱和度'),100]];
  return <Section id="localMasks" title={tz('Local masks','局部蒙版')}>
    <div className="mask-add">{(['brush','linear','radial']as const).map(kind=><button className="btn" key={kind} disabled={!ready||masks.length>=MAX_MASKS} data-testid={`add-mask-${kind}`} onClick={()=>addMask(kind)}>{maskKindName(kind)}</button>)}</div>
    {!ready&&<p className="caption">{tz('Open a single photo and wait for the preview. This engine must support local masks.','打开单张照片并等待预览完成；需要支持局部蒙版的引擎。')}</p>}
    {!masks.length&&<p className="caption">{tz('Choose a tool, draw on the image, then adjust the selected region.','选择工具，在画面上绘制选区，再调整局部效果。')}</p>}
    {masks.length>0&&<div className="mask-list">{masks.map((m,i)=><div className={'mask-list-row'+(m.id===ui.selected?' selected':'')} key={m.id}>
      <button className="mask-eye" aria-label={m.enabled?tz('Disable mask','关闭蒙版'):tz('Enable mask','启用蒙版')} aria-pressed={m.enabled} disabled={!ready} onClick={()=>{beginGesture();changeMask(m.id,q=>({...q,enabled:!q.enabled}));}}>{m.enabled?'●':'○'}</button>
      <button className="mask-select" data-testid={`select-mask-${i}`} disabled={!ready} aria-pressed={m.id===ui.selected} onClick={()=>maskUi.setState({selected:m.id,editing:true,overlay:true,erase:false})}>{m.name||`${maskKindName(m.kind)} ${i+1}`}</button>
      <button className="mask-remove" aria-label={tz('Delete mask','删除蒙版')} disabled={!ready} onClick={()=>{beginGesture();changeMasks(list=>list.filter(q=>q.id!==m.id));if(ui.selected===m.id)maskUi.setState({selected:null,editing:false});}}>×</button>
    </div>)}</div>}
    {selected&&<>
      <input className="mask-name" aria-label={tz('Mask name','蒙版名称')} maxLength={100} value={selected.name} placeholder={maskKindName(selected.kind)} disabled={!ready} onFocus={()=>beginGesture()} onChange={e=>changeMask(selected.id,m=>({...m,name:e.target.value}))}/>
      <div className="mask-actions"><button className={'btn'+(ui.editing?' primary':'')} disabled={!ready} onClick={()=>maskUi.setState({editing:!ui.editing})}>{ui.editing?tz('Finish drawing','完成绘制'):tz('Edit region','编辑选区')}</button>
        {selected.kind==='brush'&&<button className={'btn'+(ui.erase?' primary':'')} disabled={!ready} onClick={()=>maskUi.setState({erase:!ui.erase,editing:true})}>{tz('Eraser','橡皮擦')}</button>}
      </div>
      <ToggleRow label={tz('Show red overlay','显示红色选区')} on={ui.overlay} onChange={overlay=>maskUi.setState({overlay})}/>
      <ToggleRow label={tz('Invert region','反选区域')} on={selected.inverted} disabled={!ready} onChange={inverted=>{beginGesture();changeMask(selected.id,m=>({...m,inverted}));}}/>
      <ScrubSlider label={tz('Amount','强度')} value={selected.amount*100} range={[0,100]} zero={100} format={v=>`${Math.round(v)} %`} disabled={!ready} onChange={v=>changeMask(selected.id,m=>({...m,amount:v/100}))}/>
      <ScrubSlider label={tz('Feather','羽化')} value={selected.feather*100} range={[0,100]} zero={50} format={v=>`${Math.round(v)} %`} disabled={!ready} onChange={v=>changeMask(selected.id,m=>({...m,feather:v/100}))}/>
      {selected.kind==='brush'&&<ScrubSlider label={tz('Brush size','画笔大小')} value={selected.radius*100} range={[.2,40]} zero={6} format={v=>v.toFixed(1)} disabled={!ready} onChange={v=>changeMask(selected.id,m=>({...m,radius:v/100}))}/>}
      {controls.map(([key,label,limit])=><ScrubSlider key={key} label={label} value={selected.adjustments[key]} range={[-limit,limit]} zero={0} format={v=>v.toFixed(key==='exposure'?2:0)} testId={`mask-${key}`} disabled={!ready||!selected.enabled} onChange={v=>changeMask(selected.id,m=>({...m,adjustments:{...m.adjustments,[key]:v}}))}/>)}
      <button className="btn" disabled={!ready} onClick={()=>{beginGesture();changeMask(selected.id,m=>({...m,adjustments:Object.fromEntries(Object.keys(m.adjustments).map(k=>[k,0]))as LocalGrade}));}}>{tz('Reset local adjustments','重置局部调整')}</button>
      <p className="caption">{tz('Draw to replace a gradient. Drag its handles to refine it. Brush adds strokes; use Eraser to subtract. Ctrl+Z undoes a stroke.','拖动重画渐变，或拖动端点微调；画笔可追加笔画，橡皮擦可擦除。Ctrl+Z 撤销笔画。')}</p>
    </>}
    {masks.length>=MAX_MASKS&&<p className="caption">{tz('Eight masks per photo.','每张照片最多八个蒙版。')}</p>}
  </Section>;
}
