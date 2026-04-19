/**
 * AdMob web stub — no-ops so the web preview bundles cleanly.
 * The real implementation lives in ads.native.ts and is picked up by Metro
 * automatically on iOS/Android.
 */
export async function initAdMob(): Promise<void> {
  return;
}

type CounterKey = 'save_recipe' | 'analyze_ingredients' | 'generate_shopping';

export async function triggerCountedAd(_key: CounterKey): Promise<boolean> {
  return true;
}

export async function mandatoryAd(): Promise<boolean> {
  return true;
}
