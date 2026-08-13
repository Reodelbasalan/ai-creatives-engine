// /api/client-admin.js
// Admin-only endpoint para gumawa at mag-manage ng CLIENT login accounts.
// Gumagamit ng Supabase SERVICE ROLE KEY (server-side lang — hindi kailanman nalalantad sa browser).
//
// Vercel env variables na kailangan:
//   SUPABASE_URL                 = https://csyrwvimhvhqurqlrkkw.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    = (galing Supabase → Settings → API → service_role secret)
//
// Actions: create | reset-password | set-access | delete

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }

  // admin client (bypasses RLS — service role)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { action } = body;

    // ---- verify caller is an ADMIN (using their access token) ----
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid session' });

    const callerId = userData.user.id;
    const { data: prof } = await admin.from('profiles').select('role').eq('id', callerId).maybeSingle();
    if (!prof || prof.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    // ============ ACTIONS ============
    if (action === 'create') {
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';
      const name = (body.name || '').trim();
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      // create auth user (auto-confirmed para makapag-login agad)
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name }
      });
      if (cErr) return res.status(400).json({ error: cErr.message });

      const newId = created.user.id;
      // upsert profile as client
      const { error: pErr } = await admin.from('profiles').upsert({
        id: newId, email, name: name || email, role: 'client'
      }, { onConflict: 'id' });
      if (pErr) return res.status(400).json({ error: 'User created but profile failed: ' + pErr.message });

      return res.status(200).json({ ok: true, user_id: newId, email });
    }

    if (action === 'reset-password') {
      const userId = body.user_id;
      const email = (body.email || '').trim().toLowerCase();
      const newPassword = body.password || '';
      if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      let targetId = userId;
      if (!targetId && email) {
        const { data: list } = await admin.auth.admin.listUsers();
        const found = (list?.users || []).find(u => (u.email || '').toLowerCase() === email);
        if (!found) return res.status(404).json({ error: 'User not found' });
        targetId = found.id;
      }
      if (!targetId) return res.status(400).json({ error: 'user_id or email required' });

      const { error } = await admin.auth.admin.updateUserById(targetId, { password: newPassword });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'set-access') {
      // enable/disable login by banning/unbanning
      const email = (body.email || '').trim().toLowerCase();
      const enabled = !!body.enabled;
      const { data: list } = await admin.auth.admin.listUsers();
      const found = (list?.users || []).find(u => (u.email || '').toLowerCase() === email);
      if (!found) return res.status(404).json({ error: 'User not found' });

      // ban_duration 'none' = active; large duration = disabled
      const banDuration = enabled ? 'none' : '876000h'; // ~100 years
      const { error } = await admin.auth.admin.updateUserById(found.id, { ban_duration: banDuration });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, enabled });
    }

    if (action === 'delete') {
      const email = (body.email || '').trim().toLowerCase();
      const { data: list } = await admin.auth.admin.listUsers();
      const found = (list?.users || []).find(u => (u.email || '').toLowerCase() === email);
      if (!found) return res.status(404).json({ error: 'User not found' });

      await admin.from('profiles').delete().eq('id', found.id);
      const { error } = await admin.auth.admin.deleteUser(found.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
