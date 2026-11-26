-- =========================================================
-- PrimeView — 0002: تقوية صلاحيات الجداول الجديدة
-- توحيد الحماية مع باقي النظام: سحب الصلاحيات الخطيرة (TRUNCATE/REFERENCES/TRIGGER)
-- عن الأدوار العامة من جداول pv_ (أُنشئت بعد تنظيف Mr Black فما وصلها).
-- غير مدمّر: يسحب قدرات غير مستعملة فقط، لا يحذف بيانات.
-- بعد التطبيق:
--   pv_admins : authenticated = SELECT فقط (RLS يحصره على سطره) ، anon = لا شيء
--   pv_content: anon+authenticated = SELECT ، authenticated = UPDATE(data) فقط
-- =========================================================
revoke truncate, references, trigger on public.pv_admins  from anon, authenticated;
revoke truncate, references, trigger on public.pv_content from anon, authenticated;

-- سد نهائي: لا إضافة ولا حذف لصف المحتوى الوحيد عبر الـ API (التعديل فقط)
revoke delete, insert on public.pv_content from anon, authenticated;
