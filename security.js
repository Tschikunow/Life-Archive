/* LIFEARCHIVE: serverseitige Archiv-Freigabe */
'use strict';
let vaultRequestSequence = 0;
let vaultReady = false;
async function syncArchiveSession(session) {
  const request = ++vaultRequestSequence;
  state.user = session?.user || null;
  state.vault = false;
  state.prefs = null;
  state.items = [];
  state.links = [];
  state.media = [];
  state.serverVaultConfigured = false;
  if (!state.user) { vaultReady = true; render(); return; }
  try {
    const result = await db.rpc('archive_vault_status');
    if (result.error) throw result.error;
    if (request !== vaultRequestSequence) return;
    state.serverVaultConfigured = Boolean(result.data?.configured);
    state.vault = Boolean(result.data?.unlocked);
    if (state.vault) { await loadPrefs(); await loadAll(); }
    else render();
  } catch (error) {
    if (request !== vaultRequestSequence) return;
    state.vault = false;
    state.vaultMessage = 'Archiv-Freigabe konnte nicht geprüft werden. Bitte erneut anmelden.';
    render(); err(error);
  } finally { if (request === vaultRequestSequence) vaultReady = true; }
}
function vaultView() {
  const configured = Boolean(state.serverVaultConfigured);
  app.innerHTML = '<div class="auth"><div class="brand">LIFE<span style="color:var(--accent)">ARCHIVE</span></div>'+
    '<div class="eyebrow" style="margin-top:28px">GESCHÜTZTES LEBENSARCHIV</div>'+
    '<h1>'+(configured?'Archiv entsperren':'Archivcode erstmalig einrichten')+'</h1>'+
    '<p>'+(configured?'Gib deinen persönlichen Archivcode ein. Die Freigabe wird direkt auf dem Server geprüft.':'Wähle einen zusätzlichen, starken Archivcode. Ohne ihn bleiben deine Inhalte sogar nach dem Login gesperrt.')+'</p>'+
    (state.vaultMessage?'<div class="notice">'+esc(state.vaultMessage)+'</div>':'')+
    '<form id="vaultform" class="stack"><label>Archivcode<input name="code" type="password" minlength="'+(configured?'1':'12')+'" maxlength="72" autocomplete="off" placeholder="'+(configured?'Archivcode':'Mindestens 12 Zeichen')+'" required></label>'+
    '<button class="btn primary" id="vaultsubmit" type="submit">'+(configured?'Archiv sicher öffnen':'Code speichern und Archiv öffnen')+'</button></form>'+
    '<p class="muted" style="font-size:12px;margin-top:16px">Schutz: Supabase-Anmeldung + serverseitige Codeprüfung. Nach fünf Fehlversuchen wird die Codeprüfung für 15 Minuten gesperrt. Nach 8 Stunden muss der Code erneut eingegeben werden.</p>'+
    '<button id="signout" class="btn small" style="margin-top:12px">Abmelden</button></div>';
  document.getElementById('signout').onclick = logout;
  document.getElementById('vaultform').onsubmit = async e => {
    e.preventDefault();
    const btn = document.getElementById('vaultsubmit');
    btn.disabled = true; btn.textContent = 'Prüfe…';
    try {
      const code = new FormData(e.target).get('code');
      const result = configured
        ? await db.rpc('archive_unlock', {p_code:code})
        : await db.rpc('archive_set_code', {p_code:code});
      if (result.error) throw result.error;
      if (result.data !== true) throw Error('Code falsch oder Zugriff vorübergehend gesperrt.');
      state.vault = true;
      state.vaultMessage = '';
      state.serverVaultConfigured = true;
      await loadPrefs();
      await loadAll();
      toast('Archiv sicher entsperrt');
    } catch (error) {
      err(error);
      btn.disabled = false; btn.textContent = configured?'Archiv sicher öffnen':'Code speichern und Archiv öffnen';
    }
  };
}
async function lockArchive() {
  try {
    const result = await db.rpc('archive_lock');
    if (result.error) throw result.error;
  } catch (error) { err(error); }
  state.vault = false;
  state.items = [];
  state.links = [];
  state.media = [];
  state.prefs = null;
  state.detail = null;
  render();
}
const renderSettingsBeforeVault = settings;
settings = function(c) {
  renderSettingsBeforeVault(c);
  const form = document.getElementById('codeform');
  if (!form) return;
  const oldCode = form.querySelector('[name="old"]');
  const newCode = form.querySelector('[name="new"]');
  newCode.minLength = 12;
  newCode.maxLength = 72;
  oldCode.autocomplete = 'off';
  newCode.autocomplete = 'new-password';
  const description = form.previousElementSibling;
  if (description) description.textContent = 'Zum Ändern benötigst du den bisherigen Code. Die neue Sperre wird direkt in Supabase gespeichert. Andere entsperrte Sitzungen werden dabei geschlossen.';
  form.onsubmit = async e => {
    e.preventDefault();
    const submit = form.querySelector('button[type="submit"],button:not([type])');
    submit.disabled = true;
    try {
      const values = new FormData(form);
      const result = await db.rpc('archive_change_code', {p_old:values.get('old'),p_new:values.get('new')});
      if (result.error) throw result.error;
      if (result.data !== true) throw Error('Bisheriger Code falsch oder vorübergehend gesperrt.');
      form.reset();
      toast('Archivcode serverseitig geändert');
    } catch (error) { err(error); }
    finally { submit.disabled = false; }
  };
};
db.auth.onAuthStateChange((event, session) => {
  if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
  // Supabase-Abfragen erst nach dem Auth-Callback ausführen.
  setTimeout(() => { syncArchiveSession(session); }, 0);
});
(async function bootArchive() {
  try {
    const {data,error} = await db.auth.getSession();
    if (error) throw error;
    await syncArchiveSession(data.session);
  } catch (error) {
    state.user = null; state.vault = false; render(); err(error);
  }
})();