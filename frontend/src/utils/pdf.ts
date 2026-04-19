/**
 * PDF Export helper for single recipes.
 *
 * Uses `expo-print` to render an HTML template into a PDF, then `expo-sharing`
 * to open the native share sheet (WhatsApp, Email, Drive, etc.).
 *
 * Works fully in Expo Go (no new APK build required).
 */
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export interface PdfRecipe {
  id: string;
  name: string;
  platform?: string;
  thumbnail_url?: string;
  created_at?: string;
  caption?: string;
  notes?: string;
  transcription?: string;
  ingredients?: string;
  tags?: string[];
  difficulty?: string;
  prep_time?: number;
  cook_time?: number;
}

function escapeHtml(s: string = ''): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatList(text: string = ''): string {
  // Split by newlines, treat each non-empty line as a list item, strip
  // common bullet markers so we can re-add consistent styling.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^[-•*·\s\d.)]+/, '').trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return '';
  return `<ul class="list">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`;
}

function buildHtml(r: PdfRecipe, labels: Record<string, string>): string {
  const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
  const platformLabel =
    r.platform === 'instagram' ? 'Instagram'
    : r.platform === 'facebook' ? 'Facebook'
    : '';
  const metaBits: string[] = [];
  if (platformLabel) metaBits.push(platformLabel);
  if (date) metaBits.push(date);
  if (r.difficulty) metaBits.push(`${labels.difficulty || 'Difficoltà'}: ${escapeHtml(r.difficulty)}`);
  if (r.prep_time) metaBits.push(`${labels.prep_time || 'Prep'}: ${r.prep_time} min`);
  if (r.cook_time) metaBits.push(`${labels.cook_time || 'Cottura'}: ${r.cook_time} min`);

  const tagsHtml = (r.tags && r.tags.length > 0)
    ? `<div class="tags">${r.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const thumb = r.thumbnail_url
    ? `<img src="${escapeHtml(r.thumbnail_url)}" class="hero" />`
    : '';

  const ingredients = (r.ingredients && r.ingredients.trim())
    ? `<section><h2>🛒 ${labels.ingredients || 'Ingredienti'}</h2>${formatList(r.ingredients)}</section>`
    : '';

  const instructions = (r.transcription && r.transcription.trim())
    ? `<section><h2>👨‍🍳 ${labels.instructions || 'Istruzioni'}</h2>${formatList(r.transcription)}</section>`
    : '';

  const notes = (r.notes && r.notes.trim())
    ? `<section><h2>📝 ${labels.notes || 'Note'}</h2><p class="paragraph">${escapeHtml(r.notes)}</p></section>`
    : '';

  const caption = (!ingredients && !instructions && r.caption && r.caption.trim())
    ? `<section><h2>📄 ${labels.description || 'Descrizione'}</h2><p class="paragraph">${escapeHtml(r.caption)}</p></section>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(r.name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #222; line-height: 1.5; padding: 0; }
    .page { padding: 28px 32px 48px; max-width: 780px; margin: 0 auto; }
    .brand { display:flex; align-items:center; gap:8px; color:#FF6B35; font-weight:700; font-size:14px; margin-bottom:14px; letter-spacing:0.5px; }
    .brand-dot { width:10px; height:10px; background:#FF6B35; border-radius:50%; display:inline-block; }
    .hero { width: 100%; height: 280px; object-fit: cover; border-radius: 14px; margin-bottom: 22px; }
    h1 { font-size: 30px; margin: 0 0 8px; color: #1a1a1a; line-height: 1.2; }
    .meta { font-size: 13px; color: #666; margin-bottom: 18px; }
    .meta-dot { display:inline-block; margin:0 6px; color:#bbb; }
    .tags { margin-bottom: 20px; }
    .tag { background: #FFE4D1; color: #B84B14; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 500; margin-right: 6px; display:inline-block; }
    h2 { font-size: 18px; color: #FF6B35; margin: 26px 0 10px; border-bottom: 2px solid #FFE4D1; padding-bottom: 6px; }
    .list { padding-left: 20px; margin: 0; }
    .list li { margin: 6px 0; font-size: 14px; }
    .paragraph { font-size: 14px; white-space: pre-wrap; margin: 0; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; color: #888; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand"><span class="brand-dot"></span>IL RICETTARIO</div>
    ${thumb}
    <h1>${escapeHtml(r.name)}</h1>
    <div class="meta">${metaBits.map((m, i) => (i > 0 ? `<span class="meta-dot">•</span>${m}` : m)).join('')}</div>
    ${tagsHtml}
    ${ingredients}
    ${instructions}
    ${notes}
    ${caption}
    <div class="footer">Generato con Il Ricettario · ${date}</div>
  </div>
</body>
</html>`;
}

function slug(name: string): string {
  return (name || 'ricetta')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/**
 * Generate a PDF for the given recipe and open the system share sheet.
 * On web, triggers a browser download of the HTML (no native print API).
 */
export async function exportRecipeAsPdf(recipe: PdfRecipe, labels: Record<string, string> = {}): Promise<void> {
  const html = buildHtml(recipe, labels);

  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ricetta-${slug(recipe.name)}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { /* ignore */ }
    return;
  }

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  // Rename to a meaningful filename so the share sheet shows a nice title.
  let finalUri = uri;
  try {
    const target = `${FileSystem.cacheDirectory}ricetta-${slug(recipe.name)}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: target });
    finalUri = target;
  } catch (e) {
    // Keep the original uri if rename fails (works on all Android versions).
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(finalUri, {
      mimeType: 'application/pdf',
      dialogTitle: labels.share_title || 'Condividi ricetta',
      UTI: 'com.adobe.pdf',
    });
  }
}
