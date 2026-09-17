/**
 * Broadcast tab — compose a Discord webhook message.
 *
 * Security posture: the webhook URL is NEVER committed, never fetched from the
 * server, and never read from a data file. It is typed by the operator and kept
 * in sessionStorage for convenience only ("Forget" clears it). Nothing leaves
 * the browser until the operator presses Send.
 *
 * On GitHub Pages the Send button cannot work: the page origin is
 * fthyll.github.io and Discord does not allow that cross-origin POST. The tab
 * says so and offers "Copy as JSON" instead, which the operator pastes into
 * Discord or uses with scrapers/broadcast.py.
 */

const COLORS = { gold: 0xF5B942, green: 0x3BA55D, red: 0xED4245, blue: 0x5865F2, grey: 0x95A5A6 };
const STORAGE_KEY = 'coc-webhook-url';

// Webhook URLs on the page are only for local use; a hosted page can never
// reach Discord, so we surface that rather than failing with a silent CORS error.
const HOSTED = !['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);

export const TEMPLATES = [
  {
    label: 'War starting',
    title: '⚔️ War day started',
    color: 'red',
    text: 'War day starts now. Remember: **2 attacks per member**, no missed attacks.\nCheck the map and call your target in <#general>.',
  },
  {
    label: 'Reminder: attacks left',
    title: '⏰ Attacks remaining',
    color: 'gold',
    text: 'Masih ada member yang belum pakai serangannya. Cek dashboard → Wars, lalu habiskan attack sebelum waktu perang habis.',
  },
  {
    label: 'Raid weekend',
    title: '🏰 Raid weekend open',
    color: 'gold',
    text: 'Raid weekend sudah dibuka — serang semua district, habiskan 6 attack per member. Loot masuk ke clan capital kita.',
  },
  {
    label: 'Roster & donation',
    title: '🎁 Donation check',
    color: 'green',
    text: 'Cek net donation kamu di dashboard → Members. Yang masih minus, tolong push donasi minggu ini.',
  },
];

export function broadcastForm() {
  return {
    title: document.getElementById('broadcastTitle')?.value.trim() || '',
    text: document.getElementById('broadcastText')?.value.trim() || '',
    color: document.getElementById('broadcastColor')?.value || 'gold',
  };
}

/** Builds the exact Discord webhook payload for the current form state. */
export function buildPayload(form = broadcastForm()) {
  if (!form.text) return null;
  const embed = { description: form.text, color: COLORS[form.color] ?? COLORS.gold };
  if (form.title) embed.title = form.title;
  return { embeds: [embed] };
}

function setStatus(msg, tone = 'muted') {
  const el = document.getElementById('broadcastStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'text-[10px] md:text-xs ' +
    (tone === 'ok' ? 'text-green-500' : tone === 'err' ? 'text-red-400' : 'text-gray-500');
}

function renderPreview() {
  const pre = document.getElementById('broadcastPreview');
  if (!pre) return;
  const payload = buildPayload();
  pre.textContent = payload
    ? JSON.stringify(payload, null, 2)
    : '// Tulis pesan dulu untuk melihat payload JSON yang akan dikirim.';
}

async function send() {
  const payload = buildPayload();
  if (!payload) { setStatus('Pesan masih kosong.', 'err'); return; }
  const url = document.getElementById('broadcastWebhook')?.value.trim() || sessionStorage.getItem(STORAGE_KEY) || '';
  if (!url) { setStatus('Webhook URL belum diisi.', 'err'); return; }
  if (!/^https:\/\/discord(app)?\.com\/api\/webhooks\//.test(url)) {
    setStatus('URL bukan webhook Discord yang valid.', 'err'); return;
  }
  if (HOSTED) {
    setStatus('Halaman ini di-hosting; Discord memblokir requestnya. Pakai "Copy as JSON".', 'err');
    return;
  }
  if (!confirm('Kirim pesan ini sekarang ke Discord clan?')) return;
  setStatus('Mengirim…');
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { setStatus('Terkirim ke Discord.', 'ok'); }
    else if (res.status === 429) { setStatus('Rate limited oleh Discord — coba lagi sebentar.', 'err'); }
    else { setStatus(`Discord menolak: HTTP ${res.status}`, 'err'); }
  } catch (e) {
    setStatus('Gagal mengirim (CORS/jaringan). Pakai "Copy as JSON".', 'err');
  }
}

async function copyJson() {
  const payload = buildPayload();
  if (!payload) { setStatus('Pesan masih kosong.', 'err'); return; }
  const text = JSON.stringify(payload, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Payload JSON tersalin.', 'ok');
  } catch (e) {
    setStatus('Clipboard diblokir — salin manual dari kotak preview.', 'err');
  }
}

function applyTemplate(tpl) {
  const title = document.getElementById('broadcastTitle');
  const text = document.getElementById('broadcastText');
  const color = document.getElementById('broadcastColor');
  if (title) title.value = tpl.title || '';
  if (text) text.value = tpl.text || '';
  if (color) color.value = tpl.color || 'gold';
  renderPreview();
  setStatus(`Template "${tpl.label}" dimuat.`);
}

export function initBroadcast() {
  const host = document.getElementById('broadcastTemplates');
  if (host && !host.dataset.ready) {
    host.dataset.ready = '1';
    host.innerHTML = TEMPLATES.map((tpl, i) =>
      `<button class="btn-reset h-8" data-tpl="${i}">${tpl.label}</button>`).join('');
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tpl]');
      if (btn) applyTemplate(TEMPLATES[Number(btn.dataset.tpl)]);
    });
  }

  ['broadcastTitle', 'broadcastText', 'broadcastColor'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', renderPreview);
  });

  document.getElementById('broadcastSend')?.addEventListener('click', send);
  document.getElementById('broadcastCopy')?.addEventListener('click', copyJson);
  document.getElementById('broadcastWebhook')?.addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (v) sessionStorage.setItem(STORAGE_KEY, v); else sessionStorage.removeItem(STORAGE_KEY);
    setStatus('Webhook disimpan untuk sesi ini saja (tidak pernah dikirim ke server).');
  });
  document.getElementById('broadcastForget')?.addEventListener('click', () => {
    sessionStorage.removeItem(STORAGE_KEY);
    const input = document.getElementById('broadcastWebhook');
    if (input) input.value = '';
    setStatus('Webhook dilupakan.');
  });

  const saved = sessionStorage.getItem(STORAGE_KEY);
  const input = document.getElementById('broadcastWebhook');
  if (saved && input) input.value = saved;

  renderPreview();
  if (HOSTED) setStatus('Mode hosted: tombol Send dinonaktifkan oleh CORS — pakai "Copy as JSON".');
}
