// =========================================================
// PrimeView — الإعدادات العامة
// تنبيه: هذا الملف علني. لا تضع فيه أي مفتاح سري أبداً.
// المفتاح هنا "publishable" (عام)، والحماية الحقيقية من سياسات RLS.
// =========================================================
export const SUPABASE_URL = 'https://wsgpvqwapdpmpqsdjbks.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NRLTHP1jIdH_DYL7-jtOCw_XXe8s4Tf';
export const MEDIA_BUCKET = 'pv-media';

/** يقرأ محتوى الموقع من قاعدة البيانات (بدون مكتبة، حتى يبقى الموقع خفيفاً) */
export async function fetchSiteContent(timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pv_content?id=eq.1&select=data`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.data && typeof rows[0].data === 'object' ? rows[0].data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** المحتوى المحفوظ يغطّي الافتراضي قسماً قسماً */
export function mergeContent(defaults, saved) {
  const out = structuredClone(defaults);
  if (!saved) return out;
  for (const [k, v] of Object.entries(saved)) {
    if (!(k in out)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = { ...out[k], ...v };
    } else if (v !== null && v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}
