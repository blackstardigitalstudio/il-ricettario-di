/**
 * Type surface for the platform-resolved ads module.
 *
 * The real implementations live in `ads.native.ts` and `ads.web.ts`; Metro
 * picks the correct one at bundle time based on the target platform. Code
 * imports the bare specifier `./ads` (no extension), which Metro resolves but
 * the TypeScript compiler cannot. This declaration file (`ads.d.ts`) is what
 * `tsc` resolves for the bare import, giving it the shared public surface so
 * `tsc --noEmit` type-checks cleanly. The two runtime files keep this in sync.
 */
export declare const ADS_DISABLED_KEY: string;
export type CounterKey = 'save_recipe' | 'analyze_ingredients' | 'generate_shopping';
export declare function initAdMob(): Promise<void>;
export declare function triggerCountedAd(key: CounterKey): Promise<boolean>;
export declare function mandatoryAd(): Promise<boolean>;
