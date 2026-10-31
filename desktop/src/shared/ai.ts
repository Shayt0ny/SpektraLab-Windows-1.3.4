import type {Adjustments} from './adjustments';
export type AiProvider='openai'|'deepseek';
export const AI_PROVIDERS={
  openai:{name:'OpenAI',address:'https://api.openai.com/v1',model:'gpt-5.6-terra'},
  deepseek:{name:'DeepSeek',address:'https://api.deepseek.com',model:'deepseek-flash'},
} as const;
export const AI_RANGES={exposure:[-3,3],contrast:[-50,50],brightness:[-50,50],saturation:[-100,100],
  highlights:[-100,100],shadows:[-100,100],temperature:[-100,100],tint:[-100,100],blackPoint:[-50,50],whitePoint:[-50,50]} as const;
export type AiControl=keyof typeof AI_RANGES;
export interface AiProposal{summary:string;adjustments:Partial<Pick<Adjustments,AiControl>>}
export interface AiProfile{provider:AiProvider;model:string;has_key:boolean}
export interface AiSettings{active:AiProvider;profiles:Record<AiProvider,AiProfile>}
export function defaultAiSettings():AiSettings{return{active:'openai',profiles:{openai:{provider:'openai',model:AI_PROVIDERS.openai.model,has_key:false},deepseek:{provider:'deepseek',model:AI_PROVIDERS.deepseek.model,has_key:false}}};}
export function validateAiProposal(value:unknown):AiProposal{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid AI suggestion / AI 建议无效');
  const o=value as Record<string,unknown>;
  if(Object.keys(o).some(k=>!['summary','adjustments'].includes(k))||typeof o.summary!=='string'||!o.summary.trim()||o.summary.length>6000
    ||!o.adjustments||typeof o.adjustments!=='object'||Array.isArray(o.adjustments))throw Error('Invalid AI suggestion / AI 建议无效');
  for(const[k,n]of Object.entries(o.adjustments)){
    if(!Object.hasOwn(AI_RANGES,k))throw Error('Unsupported AI control / AI 控制项不支持');
    const[lo,hi]=AI_RANGES[k as AiControl];if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi)throw Error('AI adjustment out of range / AI 参数超出范围');
  }
  return {summary:o.summary,adjustments:{...o.adjustments}} as AiProposal;
}
