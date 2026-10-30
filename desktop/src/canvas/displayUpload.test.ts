import { describe, expect, it } from 'vitest';
import { displayUpload, recoveryTextureLimit } from './displayUpload';

describe('display recovery upload', () => {
  it('preserves exact 16-bit means and metadata without modifying the source', () => {
    const codes = new Uint16Array([0, 10000, 20000, 65535, 256, 10002, 40000, 65535]);
    const image = { width: 2, height: 1, colorSpace: 'display-p3', format: 'rgba16' as const, data: new Uint8Array(codes.buffer) };
    expect(displayUpload(image, 2)).toBe(image);
    const small = displayUpload(image, 1);
    expect(Array.from(new Uint16Array(small.data.buffer))).toEqual([128, 10001, 30000, 65535]);
    expect(small).toMatchObject({ width: 1, height: 1, colorSpace: 'display-p3', format: 'rgba16', nativeSize: { width: 2, height: 1 } });
    expect(codes[4]).toBe(256);
  });
  it('area-averages odd ratios and reduces recovery requests in bounded steps', () => {
    const image = { width: 3, height: 1, colorSpace: 'sRGB', data: new Uint8Array([0,0,0,255, 90,90,90,255, 180,180,180,255]) };
    expect(Array.from(displayUpload(image, 2).data)).toEqual([30,30,30,255,150,150,150,255]);
    expect([null, 8192, 2048, 1024, 512].map(recoveryTextureLimit)).toEqual([2048,2048,1024,512,512]);
  });
});
