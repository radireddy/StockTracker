import type { CorporateActionSource } from "./types";
import { nseSource } from "./nse-source";
import { bseSource } from "./bse-source";

// NSE first (historical); BSE second (forthcoming-only).
export const corporateActionSources: CorporateActionSource[] = [nseSource, bseSource];
