import { json, makeSessionCookie, userConfig, roleLabel } from '../_utils.js';

function safeEqual(a, b) { return String(a ?? '') === String(b ?? ''); }

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const u = userConfig(context.env);
    let role = null;
    let user = null;
    if (safeEqual(username, u.level3User) && safeEqual(password, u.level3Pass)) { role = 'level3'; user = u.level3User; }
    else if (safeEqual(username, u.level2User) && safeEqual(password, u.level2Pass)) { role = 'level2'; user = u.level2User; }
    else if (safeEqual(username, u.level1User) && safeEqual(password, u.level1Pass)) { role = 'level1'; user = u.level1User; }
    else return json({ ok: false, error: 'Invalid username or password.' }, 401);

    const cookie = await makeSessionCookie(context.env, { user, role });
    return json({ ok: true, user, role, label: roleLabel(role) }, 200, {
      'set-cookie': `slic_cf_session=${encodeURIComponent(cookie)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
    });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
