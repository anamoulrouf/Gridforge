// Campaign registry (GDD §6): stages unlock in order.
import STAGE1 from './stage1.js';
import STAGE2 from './stage2.js';
import STAGE3 from './stage3.js';

export const STAGES = [STAGE1, STAGE2, STAGE3];
export const stageByKey = (k) => STAGES.find((s) => s.key === k);
