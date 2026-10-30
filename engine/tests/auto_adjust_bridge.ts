// Copyright (C) 2026 shayt0ny. SPDX-License-Identifier: GPL-3.0-or-later
import {readFileSync} from 'node:fs';
import {ADJUSTMENTS_DEFAULT} from '../../desktop/src/shared/adjustments';
import {autoToneBaseline,autoToneProposal,toneStatistics,insetAutoRegion,addsClipping,saferAutoTone} from '../../desktop/src/shared/autoAdjust';
const request=JSON.parse(readFileSync(0,'utf8'));
const image={...request.image,data:new Uint8Array(readFileSync(request.pixels))};
const regions=request.regions?.map(insetAutoRegion);
const stats=toneStatistics(image,regions);
const baseline=autoToneBaseline({...ADJUSTMENTS_DEFAULT,...request.current});
const proposal=autoToneProposal(stats);
process.stdout.write(JSON.stringify({stats,baseline,proposal,safe:proposal?saferAutoTone(proposal):null,
  addedClipping:request.before?addsClipping(request.before,stats):false}));
