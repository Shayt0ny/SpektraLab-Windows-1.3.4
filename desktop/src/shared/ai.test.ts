import {describe,it,expect} from 'vitest';
import {validateAiProposal,defaultAiSettings} from './ai';
describe('AI grade contract',()=>{
  it('accepts bounded numeric grades and rejects commands, unknown controls and malformed values',()=>{
    expect(validateAiProposal({summary:'Warm and softer',adjustments:{temperature:8,highlights:-20}}).adjustments).toEqual({temperature:8,highlights:-20});
    for(const value of [null,[],{summary:'x',adjustments:{exposure:9}},{summary:'x',adjustments:{filmStock:'x'}},
      {summary:'x',adjustments:{exposure:'1'}},{summary:'x',adjustments:{exposure:NaN}},{summary:'x',adjustments:{},command:'run'}])expect(()=>validateAiProposal(value)).toThrow();
  });
  it('keeps OpenAI and DeepSeek profiles separate with no key in the public model',()=>{
    const a=defaultAiSettings(),b=defaultAiSettings();a.profiles.openai.model='user-model';
    expect(b.profiles.openai.model).not.toBe('user-model');expect(a.profiles.deepseek.has_key).toBe(false);
    expect(JSON.stringify(a)).not.toContain('api_key');
  });
});
