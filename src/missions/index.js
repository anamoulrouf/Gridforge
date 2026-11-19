// Campaign registry (GDD §6): stages unlock in order.
import STAGE1 from './stage1.js';
import STAGE2 from './stage2.js';
import STAGE3 from './stage3.js';
import STAGE4 from './stage4.js';
import STAGE5 from './stage5.js';
import STAGE6 from './stage6.js';
import STAGE7 from './stage7.js';
import STAGE8 from './stage8.js';
import STAGE9 from './stage9.js';
import STAGE10 from './stage10.js';

export const STAGES = [STAGE1, STAGE2, STAGE3, STAGE4, STAGE5, STAGE6, STAGE7, STAGE8, STAGE9, STAGE10];
export const stageByKey = (k) => STAGES.find((s) => s.key === k);
