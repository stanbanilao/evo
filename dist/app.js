/* Thynkverse showcase player — fixed version.
   Drop-in replacement for the original script: same HTML ids, same assets.
   What changed:
   - CRM moved to the end (standalone products first, CRM ties them together).
   - Natural recorded voice: plays assets/voice/<product>-<scene>.mp3 when present,
     falls back to the best browser voice (no more low-pitched robot voice).
   - Correct pronunciation: Thynkverse = "Thinkverse", iThynk = "I think", ThynkSign = "Think Sign".
   - Scenes wait for the voice to finish instead of cutting it off at a fixed 8 seconds.
   - Pause/resume keeps the voice in sync; chapter clicks, arrows and Escape work properly.
   - Safe on browsers without speech support; voices that load late are picked up. */

const products = [
  { id:'statusflow', name:'StatusFlow', kicker:'DHS status automation',
    summary:'Check every ID against DHS — roughly one per second.', accent:'#37d399',
    images:['assets/statusflow-processing.png','assets/statusflow-processing.png','assets/statusflow-categorized.png','assets/statusflow-categorized.png'],
    tivi:['assets/tivi-status-curious.png','assets/tivi-status-processing.png','assets/tivi-status-complete.png','assets/tivi-status-categorized.png'],
    scenes:[
      ['Send the workbook','Start with an Excel workbook. Upload it yourself, or simply email it to StatusFlow.'],
      ['One ID per second','StatusFlow checks every ID against DHS, about one per second, while you watch the batch move live.'],
      ['Know when it is done','When the whole file is finished, StatusFlow emails you. No need to keep watching the screen.'],
      ['Results, already organized','Your workbook comes back sorted into status groups, with a clear summary and a sheet for each.'] ]},
  { id:'ithynk', name:'iThynk', kicker:'Credit-report intelligence',
    summary:'From bureau PDF to a clear, decision-ready client review.', accent:'#ff6b35',
    image:'assets/ithynk-screen-1.png',
    scenes:[
      ['Bring in the bureau report','iThynk opens the PDF attached in your chosen credit bureau, like iDocs. No searching, no downloading.'],
      ['Extract what matters','It reads the report and pulls the client\'s credit data into one structured review.'],
      ['See the answer faster','In under a minute, it shows what may qualify for debt review, and what may not.'],
      ['Make the final decision','All the evidence in one clear view. Your team decides if the sale is ready for admin. People stay in control.'] ]},
  { id:'stride', name:'Stride', kicker:'Proposal workflow',
    summary:'A complete flagging view in three seconds — and proposals are next.', accent:'#a78bfa',
    scenes:[
      ['Three-second intake','Bring the data in. Stride turns every field into a usable case view in three seconds.'],
      ['Flags that focus','Exceptions and missing items rise to the top, so your team knows exactly where to look.'],
      ['Built in motion','Stride 17.1 keeps growing with the way your team works.'],
      ['What comes next','Next up: proposals. Checked data, turned into a client-ready outcome, faster.'] ]},
  { id:'thynksign', name:'ThynkSign', kicker:'Electronic signatures',
    summary:'Our own secure e-signature experience — simple, mobile and affordable.', accent:'#f6c453',
    scenes:[
      ['Signing should be simple','Printing, scanning and chasing signatures slow down the moment that matters most.'],
      ['Send from anywhere','ThynkSign sends a clean, simple signing experience to any phone.'],
      ['Signed and traceable','Every signature moves the agreement forward, with a clear trail behind it.'],
      ['Built for real business','Professional e-signatures, at a price that makes sense. Visit sign.thynkverse.co.za.'] ]},
  { id:'crm', name:'CRM', kicker:'Connected operations',
    summary:'Switch on automation. See predictive dates. Keep every case moving.', accent:'#4da3ff',
    scenes:[
      ['One connected view','Leads, clients, documents and actions, together in one view. And every product you have just seen, connected.'],
      ['Automation, switched on','Choose the workflow. Switch on automation. Let routine follow-ups move on their own.'],
      ['Predict what is next','Predictive dates show what is due, what may slip, and where attention belongs.'],
      ['Momentum by design','Everyone sees their next best action, without chasing the timeline.'] ]}
];

/* ---------- settings ---------- */
const VOICE_DIR = 'assets/voice/';       // recorded lines: assets/voice/statusflow-1.mp3 … crm-4.mp3
const MIN_SCENE_MS = 4500;               // shortest a scene stays on screen
const GAP_MS = 900;                      // breathing room after the voice finishes
const AUTO_NEXT_PRODUCT = true;          // after the last scene, move to the next product

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const setText = (s, t) => { const el = $(s); if (el) el.textContent = t; };
const tabs = $('#productTabs'), mock = $('#mockScreen'), frame = $('#screenFrame'),
      cursor = $('#cursor'), spot = $('#spotlight');
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const audio = new Audio(); audio.preload = 'auto';

let active = 0, scene = 0, playing = true, captions = true, muted = false, started = false;
let sceneElapsed = 0, lastTick = 0, controlsTimer = null;
let voiceDone = true, voiceToken = 0, ttsVoice = null, usingAudio = false;

/* say it the way it should sound */
function spoken(text){
  return text
    .replace(/sign\.thynkverse\.co\.za/gi, 'sign dot thinkverse dot co dot za')
    .replace(/Thynkverse/g, 'Thinkverse').replace(/iThynk/gi, 'I think')
    .replace(/ThynkSign/g, 'Think Sign').replace(/Thynk/g, 'Think')
    .replace(/StatusFlow/g, 'Status Flow').replace(/\bDHS\b/g, 'D H S')
    .replace(/17\.1/g, 'seventeen point one').replace(/\be-signature/gi, 'e signature');
}
const estimateMs = text => Math.max(MIN_SCENE_MS, text.split(/\s+/).length / 2.6 * 1000 + 1200);

/* best browser voice (only used when no recording is available) */
function pickVoice(){
  if (!synth) return;
  const vs = synth.getVoices().filter(v => /^en[-_]/i.test(v.lang));
  const score = v => {
    let s = 0; const n = v.name;
    if (/natural|neural|premium|enhanced/i.test(n)) s += 100;
    if (/online/i.test(n)) s += 30;
    if (/Andrew|Brian|Guy|Ryan|Christopher|Eric|Daniel|Google UK English Male/i.test(n)) s += 25;
    if (/en-ZA|en-GB/i.test(v.lang)) s += 8;
    if (/compact|espeak|eloquence|Fred|Albert|Zarvox|Trinoids|Bad News|Whisper|Junior|Ralph/i.test(n)) s -= 200;
    return s;
  };
  ttsVoice = vs.sort((a, b) => score(b) - score(a))[0] || null;
}
if (synth){ pickVoice(); synth.onvoiceschanged = pickVoice; }

function stopVoice(){
  voiceToken++;
  audio.onended = audio.onerror = null; audio.pause();
  if (synth) synth.cancel();
}

function speakTTS(text, token){
  usingAudio = false;
  if (!synth){ voiceDone = true; return; }
  const parts = spoken(text).match(/[^.!?]+[.!?]*/g)?.map(t => t.trim()).filter(Boolean) || [spoken(text)];
  parts.forEach((t, i) => {
    const u = new SpeechSynthesisUtterance(t);
    if (ttsVoice){ u.voice = ttsVoice; u.lang = ttsVoice.lang; }
    u.rate = 1; u.pitch = 1; u.volume = 1;
    if (i === parts.length - 1) u.onend = () => { if (token === voiceToken) voiceDone = true; };
    u.onerror = e => { if (token === voiceToken && !/interrupted|canceled/.test(e.error)) voiceDone = true; };
    synth.speak(u);
  });
}

/* plays the recording for this scene, or the browser voice if there is none */
function voice(){
  stopVoice();
  const p = products[active], text = p.scenes[scene][1];
  if (muted || !started){ voiceDone = true; return; }
  voiceDone = false; usingAudio = true;
  const token = voiceToken;
  audio.src = `${VOICE_DIR}${p.id}-${scene + 1}.mp3`;
  audio.onended = () => { if (token === voiceToken) voiceDone = true; };
  audio.onerror = () => { if (token === voiceToken) speakTTS(text, token); };
  const pr = audio.play();
  if (pr) pr.catch(() => { if (token === voiceToken && audio.error == null) speakTTS(text, token); });
}

/* ---------- screens ---------- */
function uiMarkup(p){
  const labels = { statusflow:['Lead queue','DHS checks','Exceptions','Resolved'], ithynk:['Clients','Reports','Reviews','Admin'],
    stride:['Intake','Flags','Reviews','Proposals'], crm:['Workspace','Automations','Predictive dates','Clients'],
    thynksign:['Agreements','Templates','Signers','Audit trail'] }[p.id] || ['Workspace','Activity','Reports','Settings'];
  const ready = p.id === 'statusflow' ? '1 sec' : p.id === 'stride' ? '3 sec' : '24';
  return `<div class="ui"><div class="ui-top"><div class="ui-logo"><i>${p.name.slice(0,1)}</i>${p.name.slice(1)}</div><span>Live workspace&nbsp;&nbsp;●</span></div>
    <div class="ui-body"><aside class="ui-side"><b>Workspace</b>${labels.map((x,i) => `<span class="${i === scene ? 'on' : ''}">${x}</span>`).join('')}</aside>
    <section class="ui-main"><h2>${p.scenes[scene][0]}</h2><p>${p.summary}</p>
    <div class="metric-row"><div class="metric"><small>Ready</small><strong>${ready}</strong></div>
    <div class="metric"><small>In progress</small><strong>${scene * 7 + 12}</strong></div>
    <div class="metric"><small>Attention</small><strong>${Math.max(2, 9 - scene * 2)}</strong></div></div>
    <div class="activity"><b>Live activity</b><div class="activity-line hot"></div><div class="activity-line"></div>
    <div class="activity-line" style="width:62%"></div><div class="activity-line" style="width:84%"></div></div></section></div></div>`;
}

function buildTabs(){
  tabs.innerHTML = products.map((p, i) => `<button class="product-tab ${i === 0 ? 'active' : ''}" data-index="${i}">${p.name}</button>`).join('');
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    selectProduct(+b.dataset.index, true);
  });
}

function selectProduct(i, announce = false){
  active = (i + products.length) % products.length; scene = 0; sceneElapsed = 0; playing = true;
  const p = products[active];
  document.documentElement.style.setProperty('--product', p.accent);
  [...tabs.children].forEach((b, n) => b.classList.toggle('active', n === active));
  setText('#worldCount', `${String(active + 1).padStart(2,'0')} / ${String(products.length).padStart(2,'0')}`);
  setText('#productKicker', p.kicker); setText('#productTitle', p.name); setText('#productSummary', p.summary);
  const list = $('#chapterList');
  if (list) list.innerHTML = p.scenes.map((s, n) => `<li class="${n === 0 ? 'active' : ''}">${s[0]}</li>`).join('');
  renderScene(announce); updatePlay();
}

function renderScene(speak = true){
  const p = products[active], s = p.scenes[scene], img = p.images?.[scene] || p.image;
  mock.innerHTML = img ? `<img src="${img}" alt="${p.name}: ${s[0]}">` : uiMarkup(p);
  setText('#caption', captions ? s[1] : '');
  [...($('#chapterList')?.children || [])].forEach((x, n) => x.classList.toggle('active', n === scene));
  frame?.classList.toggle('zoom', scene === 1 || scene === 2);
  spot?.classList.toggle('show', !img && scene > 0);
  if (cursor){
    cursor.style.display = img ? 'none' : '';
    const pt = [[22,72],[58,22],[70,55],[42,62]][scene] || [50,50];
    cursor.style.left = pt[0] + '%'; cursor.style.top = pt[1] + '%';
    cursor.classList.remove('click'); void cursor.offsetWidth; cursor.classList.add('click');
  }
  if (spot){
    spot.style.left = (scene === 1 ? 54 : scene === 2 ? 63 : 38) + '%';
    spot.style.top = (scene === 1 ? 18 : scene === 2 ? 47 : 55) + '%';
  }
  const side = $('#sideTivi');
  if (side) side.src = p.tivi?.[scene] || ['assets/tivi-think.png','assets/tivi-connect.png','assets/tivi-solved.png','assets/tivi-midnight.png'][scene];
  sceneElapsed = 0;
  if (speak) voice(); else { stopVoice(); voiceDone = true; }
}

function goScene(n){
  const p = products[active];
  if (n >= p.scenes.length){
    if (AUTO_NEXT_PRODUCT) selectProduct(active + 1, true); else { playing = false; updatePlay(); stopVoice(); }
    return;
  }
  if (n < 0){ selectProduct(active - 1, true); return; }
  scene = n; renderScene(true);
}

/* ---------- clock ---------- */
const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2,'0')}`; };
function tick(t){
  const dt = lastTick ? Math.min(100, t - lastTick) : 0; lastTick = t;
  if (playing && started){
    sceneElapsed += dt;
    const p = products[active], est = estimateMs(p.scenes[scene][1]);
    const waitedEnough = sceneElapsed >= MIN_SCENE_MS;
    const done = (voiceDone && waitedEnough && sceneElapsed >= (muted ? est : 0)) || sceneElapsed > est * 2 + 4000;
    if (done){
      if (!tick.doneAt) tick.doneAt = t;
      if (t - tick.doneAt >= GAP_MS){ tick.doneAt = 0; goScene(scene + 1); }
    } else tick.doneAt = 0;
    const ests = p.scenes.map(s => estimateMs(s[1])), total = ests.reduce((a, b) => a + b, 0);
    const before = ests.slice(0, scene).reduce((a, b) => a + b, 0);
    const now = before + Math.min(sceneElapsed, ests[scene]);
    const bar = $('#progress'); if (bar) bar.style.width = (now / total * 100) + '%';
    setText('#time', `${fmt(now)} / ${fmt(total)}`);
  }
  requestAnimationFrame(tick);
}

/* ---------- controls ---------- */
function updatePlay(){
  const b = $('#playBtn'); if (!b) return;
  b.textContent = playing ? 'Ⅱ' : '▶';
  b.setAttribute('aria-label', playing ? 'Pause showcase' : 'Play showcase');
}
function showControls(){
  const c = $('#controls'); if (!c) return;
  c.classList.add('visible'); clearTimeout(controlsTimer);
  controlsTimer = setTimeout(() => { if (playing) c.classList.remove('visible'); }, 2200);
}
function togglePlay(){
  playing = !playing;
  if (playing){
    if (!voiceDone && usingAudio) audio.play().catch(() => {});       // recording resumes where it stopped
    else if (!voiceDone) renderScene(true);                            // browser voice can't resume: replay the line
  } else {
    audio.pause(); if (synth) synth.cancel();
  }
  updatePlay(); showControls();
}

$('#enterBtn')?.addEventListener('click', () => {
  started = true;
  $('#intro')?.classList.add('is-leaving'); $('#player')?.classList.add('is-active');
  selectProduct(0, true); showControls();
});
$('#homeBtn')?.addEventListener('click', goHome);
function goHome(){
  started = false; stopVoice();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('#intro')?.classList.remove('is-leaving'); $('#player')?.classList.remove('is-active');
}
$('#playBtn')?.addEventListener('click', togglePlay);
$('#soundBtn')?.addEventListener('click', () => {
  muted = !muted; $('#soundBtn').textContent = muted ? 'Muted' : 'Sound';
  if (muted){ stopVoice(); voiceDone = true; } else if (playing) renderScene(true);
  showControls();
});
$('#captionsBtn')?.addEventListener('click', () => {
  captions = !captions; $('#captionsBtn').setAttribute('aria-pressed', captions);
  setText('#caption', captions ? products[active].scenes[scene][1] : ''); showControls();
});
$('#fullBtn')?.addEventListener('click', () => {
  const stage = $('#stage');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else stage?.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  showControls();
});
if (!document.fullscreenEnabled && $('#fullBtn')) $('#fullBtn').style.display = 'none';
$('#chaptersToggle')?.addEventListener('click', () => {
  const c = $('#chapters'); c.classList.toggle('closed');
  $('#chaptersToggle').setAttribute('aria-expanded', !c.classList.contains('closed'));
});
$('#chapterList')?.addEventListener('click', e => {
  const li = e.target.closest('li'); if (!li) return;
  playing = true; updatePlay();
  goScene([...li.parentNode.children].indexOf(li));
});
document.addEventListener('mousemove', showControls);
document.addEventListener('touchstart', showControls, { passive:true });
document.addEventListener('keydown', e => {
  if (!started || e.target.closest?.('input,textarea,select')) return;
  if (e.code === 'Space'){ e.preventDefault(); togglePlay(); }
  else if (e.code === 'ArrowRight') goScene(scene + 1);
  else if (e.code === 'ArrowLeft') goScene(scene > 0 ? scene - 1 : -1);
  else if (e.code === 'Escape' && !document.fullscreenElement) goHome();
  showControls();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && playing && started) togglePlay(); });

buildTabs(); selectProduct(0, false); requestAnimationFrame(tick);
