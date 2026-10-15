/* ==========================================================
   КОНФИГУРАЦИЯ ПРОЕКТА (SUPABASE + TELEGRAM + АДМИНКА)
   ========================================================== */
const SUPABASE_URL = 'https://kuahcdodqqbotuawsrat.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eO2K9Ts7jLGlZI8dS8xZdw_wSwcmC7F';
const BOT_USERNAME = 'sim_empire_bot';
const ADMIN_IDS = ['5268549164', '999999'];

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

let sb = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    try {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        console.error('Supabase init error:', e);
    }
}

const tgUser = tg?.initDataUnsafe?.user || {
    id: '999999',
    first_name: 'Web',
    username: 'ADMIN | SIM Empire'
};
const USER_ID = String(tgUser.id);
const USER_NAME = tgUser.username ? `@${tgUser.username}` : (tgUser.first_name || 'Игрок');

const COUNTRIES = [
    { id: 'ANON', name: 'Fragment NFT', flag: 'https://flagcdn.com/w40/un.png', code: '+888', ops: ['0', '8'], isAnon: true },
    { id: 'UA', name: 'Украина', flag: 'https://flagcdn.com/w40/ua.png', code: '+380', ops: ['50', '63', '66', '67', '68', '73', '93', '95', '96', '97', '98', '99'] },
    { id: 'RU', name: 'Россия', flag: 'https://flagcdn.com/w40/ru.png', code: '+7', ops: ['900', '903', '905', '916', '926', '960', '985', '999'] },
    { id: 'BY', name: 'Беларусь', flag: 'https://flagcdn.com/w40/by.png', code: '+375', ops: ['25', '29', '33', '44'] },
    { id: 'KZ', name: 'Казахстан', flag: 'https://flagcdn.com/w40/kz.png', code: '+7', ops: ['700', '701', '702', '705', '707', '708', '747', '777'] }
];

const RARITIES = [
    { id: 'common', tier: 1, name: 'Обычный', chance: 65, min: 1, max: 4, color: '#94a3b8' },
    { id: 'uncommon', tier: 2, name: 'Необычный', chance: 22, min: 6, max: 18, color: '#10b981' },
    { id: 'rare', tier: 3, name: 'Редкий', chance: 9, min: 25, max: 90, color: '#3b82f6' },
    { id: 'mythic', tier: 4, name: 'Мифический', chance: 3, min: 150, max: 500, color: '#a855f7' },
    { id: 'legendary', tier: 5, name: 'Легендарный', chance: 0.85, min: 800, max: 2500, color: '#f59e0b' },
    { id: 'secret', tier: 6, name: 'SECRET', chance: 0.15, min: 5000, max: 25000, color: '#ff0055', isSecret: true }
];

const RARITY_RANK = {
    secret: 6,
    legendary: 5,
    mythic: 4,
    rare: 3,
    uncommon: 2,
    common: 1
};

let state = {
    balance: 100,
    selectedCountry: 'ALL',
    rolls: 0,
    earned: 0,
    bestDrop: 0,
    secretsCount: 0,
    soundEnabled: true,
    inventory: [],
    boosts: {
        luckUntil: 0,
        priceLevel: 0,
        fastSpin: false,
        vip888: false
    },
    referredBy: null,
    referralsCount: 0,
    refEarnings: 0
};

let lastDroppedId = null;
let displayedBalance = 100;
let scrambleTimer = null;
let cachedLeaderboardPlayers = [];

/* ==========================================================
   SYNTH AUDIO ENGINE
   ========================================================== */
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function playTone(freq, type = 'sine', duration = 0.08, vol = 0.12) {
    if (!state.soundEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

function sfxTick(step = 0) { playTone(340 + step * 55, 'triangle', 0.04, 0.08); }
function sfxCash() {
    playTone(987.77, 'sine', 0.09, 0.14);
    setTimeout(() => playTone(1318.51, 'sine', 0.18, 0.16), 70);
}
function sfxFail() {
    playTone(220, 'sawtooth', 0.15, 0.12);
    setTimeout(() => playTone(140, 'sawtooth', 0.25, 0.14), 100);
}
function sfxRarityDrop(rarityId) {
    if (rarityId === 'common') playTone(260, 'sine', 0.09, 0.09);
    else if (rarityId === 'uncommon') {
        playTone(440, 'triangle', 0.12, 0.12);
        setTimeout(() => playTone(554.37, 'triangle', 0.16, 0.12), 70);
    } else if (rarityId === 'rare' || rarityId === 'mythic') {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
            setTimeout(() => playTone(f, 'triangle', 0.2, 0.15), idx * 65);
        });
    } else {
        [261.63, 329.63, 392.00, 523.25, 659.25, 1046.5].forEach((f, idx) => {
            setTimeout(() => playTone(f, 'sawtooth', 0.45, 0.12), idx * 55);
        });
    }
}

function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    document.getElementById('soundToggleBtn').textContent = state.soundEnabled ? '🔊' : '🔇';
    saveGame();
}

/* ==========================================================
   CANVAS САЛЮТ И 3D НАКЛОН СИМ-КАРТЫ
   ========================================================== */
const canvas = document.getElementById('fxCanvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function burstParticles(color, count = 45) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.42;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 9;
        particles.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            size: 3 + Math.random() * 5,
            color, alpha: 1,
            decay: 0.015 + Math.random() * 0.015
        });
    }
}

function loopParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.alpha -= p.decay;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    requestAnimationFrame(loopParticles);
}
loopParticles();

const simStage = document.getElementById('simStage');
const simCard = document.getElementById('simCard');
const simGlare = document.getElementById('simGlare');

function handleTiltMove(clientX, clientY) {
    const rect = simStage.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -12;
    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 14;
    simCard.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
    simGlare.style.setProperty('--gx', `${(x / rect.width) * 100}%`);
    simGlare.style.setProperty('--gy', `${(y / rect.height) * 100}%`);
}
function resetTilt() { simCard.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)'; }
simStage.addEventListener('mousemove', e => handleTiltMove(e.clientX, e.clientY));
simStage.addEventListener('mouseleave', resetTilt);
simStage.addEventListener('touchmove', e => {
    if (e.touches[0]) handleTiltMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
simStage.addEventListener('touchend', resetTilt);

/* ==========================================================
   ИЕРАРХИЯ ИНВЕНТАРЯ И ПАССИВНЫЙ МАЙНИНГ (СТЕЙКИНГ)
   ========================================================== */
function sortInventory() {
    state.inventory.sort((a, b) => {
        const rankA = RARITY_RANK[a.rarity?.id] || 1;
        const rankB = RARITY_RANK[b.rarity?.id] || 1;
        if (rankB !== rankA) return rankB - rankA;
        return (b.price || 0) - (a.price || 0);
    });
}

function getPassiveIncomePerMin() {
    const lockedTotal = state.inventory
        .filter(i => i.locked)
        .reduce((sum, i) => sum + (Number(i.price) || 0), 0);
    return Math.floor(lockedTotal * 0.02);
}

setInterval(() => {
    const perMin = getPassiveIncomePerMin();
    if (perMin >= 4) {
        const tickReward = Math.max(1, Math.round(perMin / 4));
        state.balance += tickReward;
        state.earned += tickReward;
        animateBalanceTo(state.balance);
        saveGame();
    }
}, 15000);

/* ==========================================================
   БАЗА ДАННЫХ (SUPABASE) И РЕФЕРАЛКА
   ========================================================== */
async function initApp() {
    document.getElementById('profName').textContent = USER_NAME;
    document.getElementById('profTgId').textContent = USER_ID;
    document.getElementById('myRefCodeTxt').textContent = USER_ID;
    document.getElementById('admTargetId').value = USER_ID;

    if (ADMIN_IDS.includes(USER_ID)) {
        document.getElementById('openAdminBtn').style.display = 'inline-block';
    }

    const localSaved = localStorage.getItem(`sim_empire_v6_${USER_ID}`);
    if (localSaved) {
        try { state = { ...state, ...JSON.parse(localSaved) }; } catch (e) {}
    }

    if (sb) {
        try {
            const { data, error } = await sb.from('sim_players').select('*').eq('tg_id', USER_ID).maybeSingle();
            if (!error) {
                document.getElementById('dbStatusDot').textContent = '☁️ CLOUD КАПИТАЛ';
                if (data) {
                    state.balance = Number(data.balance);
                    state.rolls = Number(data.rolls);
                    state.earned = Number(data.earned);
                    state.bestDrop = Number(data.best_drop);
                    state.secretsCount = Number(data.secrets_count);
                    state.inventory = data.inventory || [];
                    state.boosts = { ...state.boosts, ...(data.boosts || {}) };
                    state.referredBy = data.referred_by;
                    state.referralsCount = Number(data.referrals_count || 0);
                    state.refEarnings = Number(data.ref_earnings || 0);
                } else {
                    await syncToSupabase();
                }
            }
        } catch (err) {
            console.warn('Supabase sync skipped:', err);
        }
    }

    await checkReferralStartParam();

    sortInventory();
    displayedBalance = state.balance;
    renderRegionBar();
    renderBoosts();
    updateUI();
    loadLeaderboard();
}

async function syncToSupabase() {
    if (!sb) return;
    try {
        await sb.from('sim_players').upsert({
            tg_id: USER_ID,
            username: USER_NAME,
            balance: state.balance,
            rolls: state.rolls,
            earned: state.earned,
            best_drop: state.bestDrop,
            secrets_count: state.secretsCount,
            inventory: state.inventory,
            boosts: state.boosts,
            referred_by: state.referredBy,
            referrals_count: state.referralsCount,
            ref_earnings: state.refEarnings,
            updated_at: new Date().toISOString()
        });
    } catch (e) {
        console.warn('Sync error:', e);
    }
}

function saveGame() {
    sortInventory();
    localStorage.setItem(`sim_empire_v6_${USER_ID}`, JSON.stringify(state));
    updateUI();
    syncToSupabase();
}

async function applyReferralReward(inviterId) {
    const cleanId = String(inviterId).replace('ref_', '').trim();
    if (!cleanId || cleanId === USER_ID) {
        showToast('❌ Нельзя ввести свой собственный ID!');
        return false;
    }
    if (state.referredBy) {
        showToast('⚠️ Ты уже получал реферальный бонус ранее');
        return false;
    }

    if (sb) {
        try {
            const { data: inviter } = await sb.from('sim_players').select('*').eq('tg_id', cleanId).maybeSingle();
            if (inviter) {
                await sb.from('sim_players').update({
                    balance: Number(inviter.balance) + 250,
                    referrals_count: Number(inviter.referrals_count || 0) + 1,
                    ref_earnings: Number(inviter.ref_earnings || 0) + 250
                }).eq('tg_id', cleanId);
            }
        } catch (e) {
            console.warn('Ref DB update skipped:', e);
        }
    }

    state.referredBy = cleanId;
    state.balance += 250;
    sfxCash();
    haptic('success');
    animateBalanceTo(state.balance);
    saveGame();
    showToast('🎉 Начислено +250 $ за код друга!');
    return true;
}

async function checkReferralStartParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));

    const rawParam = tg?.initDataUnsafe?.start_param 
        || urlParams.get('tgWebAppStartParam') 
        || urlParams.get('startapp') 
        || hashParams.get('tgWebAppStartParam');

    if (rawParam && rawParam.startsWith('ref_') && !state.referredBy) {
        const inviterId = rawParam.replace('ref_', '').trim();
        if (inviterId && inviterId !== USER_ID) {
            await applyReferralReward(inviterId);
        }
    }
}

async function redeemManualRef() {
    const inputVal = document.getElementById('manualRefInput').value.trim();
    if (!inputVal) return showToast('Введи ID друга в поле!');
    await applyReferralReward(inputVal);
}

/* ==========================================================
   ЛИДЕРБОРД И ПРОСМОТР ЧУЖИХ СЕЙФОВ (С ЗАЩИТОЙ ОТ ОШИБОК БД)
   ========================================================== */
async function loadLeaderboard() {
    const listEl = document.getElementById('leaderboardList');
    const hintEl = document.getElementById('lbStatusHint');

    // Сразу обеспечиваем себе место в списке на случай, если БД еще не настроена
    const myInvVal = state.inventory.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    const myEntry = {
        tg_id: USER_ID,
        username: USER_NAME,
        balance: state.balance,
        netWorth: state.balance + myInvVal,
        rolls: state.rolls,
        secretsCount: state.secretsCount,
        inventory: state.inventory
    };

    let rowsFromDb = null;

    if (sb) {
        try {
            // Сначала синхронизируем себя в базу
            await syncToSupabase();
            const { data, error } = await sb
                .from('sim_players')
                .select('tg_id, username, balance, inventory, rolls, secrets_count')
                .limit(50);

            if (error) {
                console.warn('Leaderboard error:', error.message);
                if (hintEl) hintEl.textContent = `Локальный режим (Выполни SQL в Supabase: ${error.code || 'нет таблицы'})`;
            } else if (data && data.length > 0) {
                rowsFromDb = data;
                if (hintEl) hintEl.textContent = 'Нажми на игрока, чтобы посмотреть его сейф';
            }
        } catch (e) {
            console.warn('Leaderboard fetch failed:', e);
        }
    }

    if (rowsFromDb) {
        cachedLeaderboardPlayers = rowsFromDb.map(p => {
            const inv = Array.isArray(p.inventory) ? p.inventory : [];
            const invValue = inv.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
            const netWorth = Number(p.balance || 0) + invValue;
            return {
                tg_id: String(p.tg_id),
                username: p.username || `ID ${p.tg_id}`,
                balance: Number(p.balance || 0),
                netWorth,
                rolls: Number(p.rolls || 0),
                secretsCount: Number(p.secrets_count || 0),
                inventory: inv
            };
        }).sort((a, b) => b.netWorth - a.netWorth).slice(0, 15);
    } else {
        // Резервный список, чтобы Лидерборд всегда работал и не писал ошибку
        cachedLeaderboardPlayers = [myEntry];
    }

    listEl.innerHTML = cachedLeaderboardPlayers.map((p, idx) => {
        const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        const isMe = p.tg_id === USER_ID ? 'me' : '';
        return `
            <div class="lb-row ${isMe}" onclick="inspectPlayer('${p.tg_id}')">
                <div class="lb-left">
                    <span class="lb-rank">${rankIcon}</span>
                    <div>
                        <div class="lb-name">${p.username} ${isMe ? '(Ты)' : ''}</div>
                        <div class="lb-sub">Симок: ${p.inventory.length} шт. • Круток: ${p.rolls}</div>
                    </div>
                </div>
                <div class="lb-score">${p.netWorth.toLocaleString()} $ ›</div>
            </div>
        `;
    }).join('');
}

function inspectPlayer(tgId) {
    const player = cachedLeaderboardPlayers.find(p => p.tg_id === String(tgId));
    if (!player) return;

    haptic('light');
    document.getElementById('inspName').textContent = `👤 ${player.username}`;
    document.getElementById('inspStatsBar').innerHTML = `
        <div class="insp-stat-box"><span>Капитал</span><b>${player.netWorth.toLocaleString()} $</b></div>
        <div class="insp-stat-box"><span>Круток</span><b style="color:#fff;">${player.rolls}</b></div>
        <div class="insp-stat-box"><span>SECRET</span><b style="color:#ff0055;">${player.secretsCount}</b></div>
    `;

    const simList = document.getElementById('inspSimList');
    const sortedInv = [...player.inventory].sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 5);

    if (sortedInv.length === 0) {
        simList.innerHTML = '<div style="text-align:center; color:var(--subtext); padding:20px; font-size:13px;">У игрока пока нет сохраненных номеров в сейфе</div>';
    } else {
        simList.innerHTML = sortedInv.map(item => {
            const badge = item.rarity?.isSecret
                ? `<span class="secret-blur" style="padding:2px 6px; border-radius:5px; font-weight:900;">SECRET</span>`
                : `<span style="color:${item.rarity?.color || '#94a3b8'}; font-weight:800;">${item.rarity?.name || 'SIM'}</span>`;
            const iconHtml = item.countryId === 'ANON' ? `<span>🏴‍☠️</span>` : `<img src="${item.flag}" alt="">`;
            return `
                <div class="inv-row-card" style="border-left-color: ${item.rarity?.color || '#94a3b8'}">
                    <div class="inv-info">
                        <div class="inv-phone-line">
                            ${iconHtml}
                            <span class="inv-phone-txt">${item.number}</span>
                        </div>
                        <div class="inv-sub-line">
                            ${badge} • <span>${item.patternTitle || item.countryName}</span>
                        </div>
                    </div>
                    <div style="font-family:'JetBrains Mono',monospace; font-weight:800; color:#10b981; font-size:14px;">
                        ${Number(item.price || 0).toLocaleString()} $
                    </div>
                </div>
            `;
        }).join('');
    }

    document.getElementById('inspectorModal').classList.add('show');
}

function closeInspectorModal() {
    document.getElementById('inspectorModal').classList.remove('show');
}

/* ==========================================================
   РЕГИОНЫ И АНОНИМНЫЕ НОМЕРА +888
   ========================================================== */
function getRollCost() {
    if (state.selectedCountry === 'ANON') {
        return state.boosts.vip888 ? 35 : 50;
    }
    return 5;
}

function renderRegionBar() {
    const bar = document.getElementById('regionBar');
    let html = `
        <button class="region-pill ${state.selectedCountry === 'ALL' ? 'active' : ''}" onclick="selectCountry('ALL')">
            <span>🎲 Все</span>
        </button>
    `;
    COUNTRIES.forEach(c => {
        const active = state.selectedCountry === c.id ? 'active' : '';
        const anonClass = c.isAnon ? 'anon-pill' : '';
        const iconHtml = c.isAnon ? `<span>🏴‍☠️</span>` : `<img src="${c.flag}" alt="${c.id}">`;
        html += `
            <button class="region-pill ${anonClass} ${active}" onclick="selectCountry('${c.id}')">
                ${iconHtml}
                <span>${c.code}</span>
            </button>
        `;
    });
    bar.innerHTML = html;

    const cost = getRollCost();
    document.getElementById('rollCostBadge').textContent = `Тап: ${cost} $`;
    document.getElementById('spinBtnTitle').textContent = state.selectedCountry === 'ANON'
        ? `🏴‍☠️ Выбить NFT +888 (${cost} $)`
        : `⚡ Сгенерировать SIM (${cost} $)`;
}

function selectCountry(id) {
    state.selectedCountry = id;
    haptic('light');
    playTone(480, 'sine', 0.05, 0.07);

    const card = document.getElementById('simCard');
    const chip = document.getElementById('simChip');
    if (id === 'ANON') {
        card.classList.add('anon-theme');
        chip.classList.add('cyber-chip');
    } else {
        card.classList.remove('anon-theme');
        chip.classList.remove('cyber-chip');
    }

    renderRegionBar();
    saveGame();
}

/* ==========================================================
   ГЕНЕРАТОР ПАТТЕРНОВ (+888 И КЛАССИЧЕСКИЕ ОПЕРАТОРЫ)
   ========================================================== */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randDigit() { return Math.floor(Math.random() * 10).toString(); }

function isLuckActive() {
    return Date.now() < (state.boosts.luckUntil || 0);
}

function pickRarity() {
    const luckMult = isLuckActive() ? 2.2 : 1;
    const weights = RARITIES.map(r => {
        if (['rare', 'mythic', 'legendary', 'secret'].includes(r.id)) {
            return { ...r, weight: r.chance * luckMult };
        }
        return { ...r, weight: r.chance };
    });

    const totalWeight = weights.reduce((acc, item) => acc + item.weight, 0);
    const roll = Math.random() * totalWeight;
    let sum = 0;
    for (const r of weights) {
        sum += r.weight;
        if (roll <= sum) return r;
    }
    return RARITIES[0];
}

function buildNumberTailWithReason(rarityId, isAnon = false) {
    const d1 = randDigit();
    let d2 = randDigit();
    while (d2 === d1) d2 = randDigit();

    if (isAnon && rarityId === 'secret') {
        const anonSecrets = [
            {
                tail: '777', isShortAnon: true, hlStart: 0,
                patternTitle: '🏴‍☠️ УЛЬТРА-КОРОТКИЙ NFT (+888 0 777)',
                patternDesc: 'Четырехзначный анонимный номер Telegram! Такие лоты на Fragment стоят десятки тысяч долларов.'
            },
            {
                tail: '8888888', hlStart: 0,
                patternTitle: '♾️ ПОЛНЫЙ МОНОЛИТ TON (+888 8 888 88 88)',
                patternDesc: 'Все восьмерки вместе с кодом +888! Абсолютный грааль крипто-коллекционеров.'
            },
            {
                tail: '0000000', hlStart: 0,
                patternTitle: '👻 НУЛЕВОЙ БЛОКЧЕЙН-КЛЮЧ (+888 0 000 00 00)',
                patternDesc: 'Чистейший анонимный номер из одних нулей.'
            }
        ];
        return anonSecrets[randInt(0, anonSecrets.length - 1)];
    }

    switch (rarityId) {
        case 'common': {
            let s = '';
            for (let i = 0; i < 7; i++) s += randDigit();
            return {
                tail: s, hlStart: 7,
                patternTitle: isAnon ? 'Базовый NFT +888' : 'Стандартный абонент',
                patternDesc: 'Обычный базовый номер без повторяющихся блоков.'
            };
        }
        case 'uncommon': {
            const p = randInt(1, 3);
            if (p === 1) return {
                tail: `${randDigit()}${randDigit()}${randDigit()}${d1}${d1}${d2}${d2}`, hlStart: 3,
                patternTitle: `Двойной дубль (${d1}${d1}-${d2}${d2})`,
                patternDesc: 'Красивое парное окончание в последних 4 цифрах.'
            };
            if (p === 2) return {
                tail: `${randDigit()}${randDigit()}${randDigit()}${randDigit()}${randDigit()}69`, hlStart: 5,
                patternTitle: 'Спец-код «69»',
                patternDesc: 'Мемная концовка, которую моментально забирают на перепродажу.'
            };
            return {
                tail: `${randDigit()}${randDigit()}${randDigit()}${randDigit()}${d1}00`, hlStart: 4,
                patternTitle: `Чистая сотня (${d1}00)`,
                patternDesc: 'Два нуля на конце придают номеру аккуратный вид.'
            };
        }
        case 'rare': {
            const p = randInt(1, 2);
            if (p === 1) return {
                tail: `${randDigit()}${randDigit()}${randDigit()}${randDigit()}${d1}${d1}${d1}`, hlStart: 4,
                patternTitle: `Трипл-блок (${d1}${d1}${d1})`,
                patternDesc: 'Три одинаковые цифры подряд на конце.'
            };
            return {
                tail: `${randDigit()}${d1}${d2}${d1}${d2}${d1}${d2}`, hlStart: 1,
                patternTitle: `Ритм-маятник (${d1}${d2}-${d1}${d2}-${d1}${d2})`,
                patternDesc: 'Тройное повторение одной и той же пары цифр.'
            };
        }
        case 'mythic': {
            const p = randInt(1, 2);
            if (p === 1) return {
                tail: `${randDigit()}${randDigit()}${randDigit()}${d1}${d1}${d1}${d1}`, hlStart: 3,
                patternTitle: `Квадро-монолит (${d1}${d1}-${d1}${d1})`,
                patternDesc: 'Четыре одинаковые цифры в хвосте номера.'
            };
            return {
                tail: `${d1}${d2}000${d2}${d1}`, hlStart: 0,
                patternTitle: `Зеркальный купол (${d1}${d2}-000-${d2}${d1})`,
                patternDesc: 'Безупречная зеркальная симметрия вокруг центральных нулей.'
            };
        }
        case 'legendary': {
            const nz = d1 === '0' ? '7' : d1;
            const p = randInt(1, 2);
            if (p === 1) return {
                tail: `0000${nz}${nz}${nz}`, hlStart: 0,
                patternTitle: `💎 КВАДРО-НУЛИ + ТРИПЛ (000-0${nz}-${nz}${nz})`,
                patternDesc: `Четыре нуля подряд переходят в тройку «${nz}». Премиальный директорский стандарт.`
            };
            return {
                tail: `00000${nz}${nz}`, hlStart: 0,
                patternTitle: `🔥 ПЕНТА-НУЛИ (000-00-${nz}${nz})`,
                patternDesc: `Пять нулей подряд и парный акцент «${nz}${nz}» на самом конце.`
            };
        }
        case 'secret': {
            const pool = [
                {
                    tail: '7777777', hlStart: 0,
                    patternTitle: '🎰 АБСОЛЮТНЫЙ ДЖЕКПОТ (777-77-77)',
                    patternDesc: 'Семь семерок подряд! Легендарный номер-миллионник.'
                },
                {
                    tail: '0000000', hlStart: 0,
                    patternTitle: '👻 ПРИЗРАЧНЫЙ НОЛЬ (000-00-00)',
                    patternDesc: 'Семь нулей подряд. Спец-номер закрытого правительственного пула.'
                },
                {
                    tail: '8888888', hlStart: 0,
                    patternTitle: '♾️ КОД БЕСКОНЕЧНОСТИ (888-88-88)',
                    patternDesc: 'Семь восьмерок подряд — символ финансовой империи.'
                }
            ];
            return pool[randInt(0, pool.length - 1)];
        }
    }
}

function formatPlainPhone(code, op, tail, isShortAnon = false) {
    if (isShortAnon) return `${code} ${op} ${tail}`;
    return `${code} ${op} ${tail.slice(0,3)} ${tail.slice(3,5)} ${tail.slice(5,7)}`;
}

function formatHighlightedPhone(code, op, tail, hlStart, color, isShortAnon = false) {
    if (isShortAnon) {
        return `<span style="opacity:0.8">${code} ${op}</span> <span class="hl-digits" style="--hl-color:${color}">${tail}</span>`;
    }
    let digitsHtml = '';
    for (let i = 0; i < 7; i++) {
        const ch = tail[i];
        const space = (i === 3 || i === 5) ? ' ' : '';
        if (i >= hlStart) {
            digitsHtml += `${space}<span class="hl-digits" style="--hl-color:${color}">${ch}</span>`;
        } else {
            digitsHtml += `${space}${ch}`;
        }
    }
    return `<span style="opacity:0.75">${code} ${op}</span> ${digitsHtml}`;
}

function buildSimItem(country, rarity) {
    const op = country.ops[randInt(0, country.ops.length - 1)];
    const patternData = buildNumberTailWithReason(rarity.id, country.isAnon);

    const anonMult = country.isAnon ? 10 : 1;
    const boostMult = 1 + (state.boosts.priceLevel || 0) * 0.25;
    const rawPrice = randInt(rarity.min, rarity.max) * anonMult * boostMult;
    const price = Math.round(rawPrice);

    const plainNumber = formatPlainPhone(country.code, op, patternData.tail, patternData.isShortAnon);

    return {
        id: Date.now() + Math.random(),
        code: country.code,
        op: op,
        tail: patternData.tail,
        isShortAnon: !!patternData.isShortAnon,
        hlStart: patternData.hlStart,
        number: plainNumber,
        countryId: country.id,
        countryName: country.name,
        flag: country.flag,
        rarity: rarity,
        price: price,
        locked: false,
        patternTitle: patternData.patternTitle,
        patternDesc: patternData.patternDesc
    };
}

/* ==========================================================
   ГЕНЕРАЦИЯ SIM-КАРТЫ
   ========================================================== */
function generateSim() {
    const cost = getRollCost();
    if (state.balance < cost) {
        showToast(`Недостаточно $! Нужно ${cost} $ для крутки`);
        haptic('error');
        return;
    }

    if (scrambleTimer) clearInterval(scrambleTimer);

    state.balance -= cost;
    animateBalanceTo(state.balance);
    state.rolls += 1;

    let country;
    if (state.selectedCountry === 'ALL') {
        const regularPool = COUNTRIES.filter(c => !c.isAnon);
        country = regularPool[randInt(0, regularPool.length - 1)];
    } else {
        country = COUNTRIES.find(c => c.id === state.selectedCountry) || COUNTRIES[1];
    }

    const rarity = pickRarity();
    const newItem = buildSimItem(country, rarity);

    state.inventory.unshift(newItem);
    lastDroppedId = newItem.id;

    if (newItem.price > state.bestDrop) state.bestDrop = newItem.price;
    if (rarity.isSecret) state.secretsCount += 1;

    saveGame();

    if (state.boosts.fastSpin) {
        finalizeDropReveal(newItem);
    } else {
        runSlotScramble(newItem);
    }
}

function runSlotScramble(item) {
    const badge = document.getElementById('cardRegionBadge');
    const watermark = document.getElementById('simWatermark');
    const phoneDisplay = document.getElementById('phoneDisplay');
    const reasonPill = document.getElementById('reasonPill');
    const rarityBadge = document.getElementById('rarityBadge');
    const priceDisplay = document.getElementById('priceDisplay');

    badge.innerHTML = item.countryId === 'ANON'
        ? `<span>🏴‍☠️ ${item.countryName}</span>`
        : `<img src="${item.flag}" alt=""><span>${item.countryName}</span>`;
    watermark.textContent = item.code;
    reasonPill.textContent = 'Генерация сигнала...';
    rarityBadge.className = 'rarity-chip';
    rarityBadge.textContent = 'СКАНИРОВАНИЕ...';
    priceDisplay.textContent = '... $';

    let step = 0;
    const len = item.tail.length;

    scrambleTimer = setInterval(() => {
        step++;
        sfxTick(step);
        if (step % 2 === 0) haptic('light');

        let tempTail = '';
        for (let i = 0; i < len; i++) {
            if (i < step) tempTail += item.tail[i];
            else tempTail += randDigit();
        }
        phoneDisplay.textContent = formatPlainPhone(item.code, item.op, tempTail, item.isShortAnon);

        if (step >= len) {
            clearInterval(scrambleTimer);
            scrambleTimer = null;
            finalizeDropReveal(item);
        }
    }, 32);
}

function finalizeDropReveal(item) {
    const card = document.getElementById('simCard');
    const badge = document.getElementById('cardRegionBadge');
    const watermark = document.getElementById('simWatermark');
    const orb1 = document.getElementById('orb1');
    const phoneDisplay = document.getElementById('phoneDisplay');
    const reasonPill = document.getElementById('reasonPill');
    const rarityBadge = document.getElementById('rarityBadge');
    const priceDisplay = document.getElementById('priceDisplay');
    const actionBar = document.getElementById('actionBar');
    const quickSellBtn = document.getElementById('quickSellBtn');

    badge.innerHTML = item.countryId === 'ANON'
        ? `<span>🏴‍☠️ ${item.countryName}</span>`
        : `<img src="${item.flag}" alt=""><span>${item.countryName}</span>`;
    watermark.textContent = item.code;

    phoneDisplay.innerHTML = formatHighlightedPhone(
        item.code, item.op, item.tail, item.hlStart, item.rarity.color, item.isShortAnon
    );

    reasonPill.textContent = item.patternTitle;
    reasonPill.style.color = item.rarity.id === 'common' ? '#94a3b8' : '#ffffff';
    reasonPill.style.borderColor = `${item.rarity.color}66`;

    priceDisplay.textContent = `${item.price.toLocaleString()} $`;
    orb1.style.background = item.rarity.color;

    rarityBadge.className = 'rarity-chip';
    if (item.rarity.isSecret) {
        rarityBadge.classList.add('secret-blur');
        rarityBadge.textContent = 'SECRET';
        card.style.borderColor = '#ff0055';
        card.style.boxShadow = '0 25px 50px rgba(0,0,0,0.85), 0 0 55px rgba(255, 0, 85, 0.55)';
    } else {
        rarityBadge.textContent = item.rarity.name;
        rarityBadge.style.color = item.rarity.color;
        card.style.borderColor = item.rarity.color;
        card.style.boxShadow = `0 25px 50px rgba(0,0,0,0.85), 0 0 40px ${item.rarity.color}38`;
    }

    quickSellBtn.innerHTML = `💰 Быстро продать за +${item.price.toLocaleString()} $`;
    actionBar.classList.add('visible');

    sfxRarityDrop(item.rarity.id);

    if (['rare', 'mythic'].includes(item.rarity.id)) {
        haptic('medium');
        burstParticles(item.rarity.color, 35);
    } else if (['legendary', 'secret'].includes(item.rarity.id)) {
        triggerCinematicModal(item);
    } else {
        haptic('light');
    }
}

function triggerCinematicModal(item) {
    document.body.classList.remove('screen-shake');
    void document.body.offsetWidth;
    document.body.classList.add('screen-shake');

    haptic('heavy');
    setTimeout(() => haptic('success'), 160);
    burstParticles(item.rarity.color, 85);

    const overlay = document.getElementById('cineOverlay');
    const rays = document.getElementById('godRays');
    const pill = document.getElementById('cinePill');
    const heading = document.getElementById('cineHeading');
    const showcase = document.getElementById('cineShowcase');
    const region = document.getElementById('cineRegion');
    const number = document.getElementById('cineNumber');
    const price = document.getElementById('cinePrice');
    const whyTitle = document.getElementById('cineWhyTitle');
    const whyDesc = document.getElementById('cineWhyDesc');
    const btn = document.getElementById('cineBtn');

    region.innerHTML = item.countryId === 'ANON'
        ? `<span>🏴‍☠️ ${item.countryName}</span>`
        : `<img src="${item.flag}" alt=""><span>${item.countryName}</span>`;
    number.innerHTML = formatHighlightedPhone(item.code, item.op, item.tail, item.hlStart, item.rarity.color, item.isShortAnon);
    price.textContent = `${item.price.toLocaleString()} $`;
    whyTitle.textContent = item.patternTitle;
    whyDesc.textContent = item.patternDesc;

    if (item.rarity.isSecret) {
        rays.style.setProperty('--beam-color', 'rgba(255, 0, 85, 0.38)');
        pill.textContent = '⚠️ ЗАСЕКРЕЧЕННЫЙ ТИР';
        pill.style.background = 'rgba(255, 0, 85, 0.2)';
        pill.style.color = '#ff0055';
        heading.textContent = 'SECRET DROP';
        heading.className = 'cine-heading secret-blur';
        showcase.style.borderColor = '#ff0055';
        btn.style.background = 'linear-gradient(135deg, #ff0055, #9333ea)';
        btn.style.color = '#fff';
    } else {
        rays.style.setProperty('--beam-color', 'rgba(245, 158, 11, 0.34)');
        pill.textContent = '🏆 ЭЛИТНЫЙ ТИР';
        pill.style.background = 'rgba(245, 158, 11, 0.2)';
        pill.style.color = '#fbbf24';
        heading.textContent = 'ЛЕГЕНДАРНЫЙ!';
        heading.className = 'cine-heading';
        heading.style.color = '#fbbf24';
        showcase.style.borderColor = '#f59e0b';
        btn.style.background = 'linear-gradient(135deg, #fbbf24, #d97706)';
        btn.style.color = '#000';
    }

    overlay.classList.add('show');
}

function closeCineModal() {
    document.getElementById('cineOverlay').classList.remove('show');
    haptic('light');
}

/* ==========================================================
   РИСК-АПГРЕЙД НОМЕРА (2X ЦЕНА И ПОВЫШЕНИЕ ТИРА С ШАНСОМ 45%)
   ========================================================== */
function upgradeSimItem(id) {
    const idx = state.inventory.findIndex(i => i.id === id);
    if (idx === -1) return;
    const item = state.inventory[idx];

    if (item.locked) {
        haptic('warning');
        return showToast('🔒 Сними замок перед риск-апгрейдом!');
    }

    const win = Math.random() < 0.45;
    if (win) {
        item.price = Math.round(item.price * 2);
        const currentRank = RARITY_RANK[item.rarity.id] || 1;
        if (currentRank < 6) {
            const nextRarity = RARITIES.find(r => r.tier === currentRank + 1);
            if (nextRarity) item.rarity = nextRarity;
        }
        if (item.price > state.bestDrop) state.bestDrop = item.price;

        sfxRarityDrop('rare');
        haptic('success');
        burstParticles(item.rarity.color, 40);
        showToast(`🔥 АПГРЕЙД УСПЕШЕН! Новая цена: ${item.price.toLocaleString()} $`);
    } else {
        state.inventory.splice(idx, 1);
        sfxFail();
        haptic('error');
        showToast(`💥 Номер ${item.number} сгорел при перепрошивке!`);
    }

    saveGame();
}

/* ==========================================================
   МАГАЗИН БУСТОВ
   ========================================================== */
function renderBoosts() {
    const container = document.getElementById('boostsList');
    const luckActive = isLuckActive();
    const priceLvl = state.boosts.priceLevel || 0;
    const priceUpgradeCost = (priceLvl + 1) * 250;

    container.innerHTML = `
        <div class="boost-card">
            <div class="inv-info">
                <div class="inv-phone-txt">🍀 Клевер Удачи (2X Шанс)</div>
                <div class="inv-sub-line">Удваивает шанс на Редкие, Легендарные и SECRET на 15 мин.</div>
            </div>
            <button class="boost-buy-btn" onclick="buyBoost('luck')">
                ${luckActive ? 'Продлить (150$)' : '150 $'}
            </button>
        </div>

        <div class="boost-card">
            <div class="inv-info">
                <div class="inv-phone-txt">📈 Наценка барыги (Ур. ${priceLvl}/5)</div>
                <div class="inv-sub-line">Все выбитые номера стоят на +${priceLvl * 25}% дороже навсегда.</div>
            </div>
            <button class="boost-buy-btn ${priceLvl >= 5 ? 'owned' : ''}" onclick="buyBoost('price')">
                ${priceLvl >= 5 ? 'МАКС.' : `${priceUpgradeCost}$`}
            </button>
        </div>

        <div class="boost-card">
            <div class="inv-info">
                <div class="inv-phone-txt">⚡ Турбо-декодер</div>
                <div class="inv-sub-line">Мгновенное открытие номеров без ожидания анимации цифр.</div>
            </div>
            <button class="boost-buy-btn" onclick="buyBoost('fast')">
                ${state.boosts.fastSpin ? 'ВКЛ (Выкл)' : '300 $'}
            </button>
        </div>

        <div class="boost-card">
            <div class="inv-info">
                <div class="inv-phone-txt">🏴‍☠️ Лицензия Fragment +888</div>
                <div class="inv-sub-line">Снижает стоимость крутки анонимных номеров +888 с 50$ до 35$.</div>
            </div>
            <button class="boost-buy-btn ${state.boosts.vip888 ? 'owned' : ''}" onclick="buyBoost('vip888')">
                ${state.boosts.vip888 ? 'Куплено' : '1 000 $'}
            </button>
        </div>
    `;
}

function buyBoost(type) {
    if (type === 'luck') {
        if (state.balance < 150) return showToast('Нужно 150 $ для покупки!');
        state.balance -= 150;
        const base = Math.max(Date.now(), state.boosts.luckUntil || 0);
        state.boosts.luckUntil = base + 15 * 60 * 1000;
        showToast('🍀 Удача 2X активирована на 15 минут!');
    } else if (type === 'price') {
        const lvl = state.boosts.priceLevel || 0;
        if (lvl >= 5) return;
        const cost = (lvl + 1) * 250;
        if (state.balance < cost) return showToast(`Нужно ${cost} $!`);
        state.balance -= cost;
        state.boosts.priceLevel = lvl + 1;
        showToast(`📈 Выкуп номеров увеличен до +${state.boosts.priceLevel * 25}%!`);
    } else if (type === 'fast') {
        if (state.boosts.fastSpin) {
            state.boosts.fastSpin = false;
            showToast('Турбо-спин выключен');
        } else {
            if (state.balance < 300) return showToast('Нужно 300 $!');
            state.balance -= 300;
            state.boosts.fastSpin = true;
            showToast('⚡ Турбо-спин активирован!');
        }
    } else if (type === 'vip888') {
        if (state.boosts.vip888) return;
        if (state.balance < 1000) return showToast('Нужно 1 000 $!');
        state.balance -= 1000;
        state.boosts.vip888 = true;
        renderRegionBar();
        showToast('🏴‍☠️ Скидка на +888 активирована навсегда!');
    }

    sfxCash();
    haptic('success');
    animateBalanceTo(state.balance);
    renderBoosts();
    saveGame();
}

/* ==========================================================
   РЕФЕРАЛЬНЫЕ ССЫЛКИ В TELEGRAM
   ========================================================== */
function getInviteLink() {
    return `https://t.me/${BOT_USERNAME}?startapp=ref_${USER_ID}`;
}

function shareInviteLink() {
    const link = getInviteLink();
    const text = `Залетай в SIM Empire! Выбивай блатные номера +888 и вводи мой ID ${USER_ID} во вкладке «Друзья» ради +250$ бонуса 🔥`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
    } else {
        window.open(shareUrl, '_blank');
    }
}

function copyInviteLink() {
    navigator.clipboard?.writeText(getInviteLink());
    haptic('light');
    showToast('🔗 Реферальная ссылка скопирована!');
}

function copyMyId() {
    navigator.clipboard?.writeText(USER_ID);
    haptic('light');
    showToast(`ID ${USER_ID} скопирован!`);
}

/* ==========================================================
   АВТО-СИНХРОНИЗАЦИЯ ПОДАРКОВ ОТ АДМИНА (КАЖДЫЕ 6 СЕК)
   ========================================================== */
setInterval(async () => {
    if (!sb) return;
    try {
        const { data, error } = await sb.from('sim_players').select('*').eq('tg_id', USER_ID).maybeSingle();
        if (error || !data) return;

        let changed = false;

        // Если админ начислил баланс в БД
        if (Number(data.balance) > state.balance) {
            const diff = Number(data.balance) - state.balance;
            state.balance = Number(data.balance);
            animateBalanceTo(state.balance);
            showToast(`🎁 Получено +${diff.toLocaleString()} $!`);
            sfxCash();
            changed = true;
        }

        // Если админ прислал номер в инвентарь
        const dbInv = Array.isArray(data.inventory) ? data.inventory : [];
        if (dbInv.length > state.inventory.length) {
            state.inventory = dbInv;
            showToast('📲 Получен новый номер в Сейф!');
            sfxRarityDrop('rare');
            changed = true;
        }

        // Если админ выдал бусты
        if (data.boosts) {
            const b = data.boosts;
            if (
                (b.luckUntil || 0) > (state.boosts.luckUntil || 0) ||
                (b.priceLevel || 0) > (state.boosts.priceLevel || 0) ||
                (b.fastSpin && !state.boosts.fastSpin) ||
                (b.vip888 && !state.boosts.vip888)
            ) {
                state.boosts = { ...state.boosts, ...b };
                renderBoosts();
                renderRegionBar();
                showToast('🚀 Администратор выдал тебе буст!');
                sfxCash();
                changed = true;
            }
        }

        if (changed) {
            sortInventory();
            localStorage.setItem(`sim_empire_v6_${USER_ID}`, JSON.stringify(state));
            updateUI();
        }
    } catch (e) {}
}, 6000);

/* ==========================================================
   АДМИН-ПАНЕЛЬ (ВЫДАЧА ВАЛЮТЫ, БУСТОВ И НОМЕРОВ)
   ========================================================== */
async function openAdminModal() {
    document.getElementById('adminModal').classList.add('show');
    document.getElementById('admStatusLog').textContent = 'Загрузка списка игроков...';

    const selectEl = document.getElementById('admPlayerList');
    if (!sb) {
        document.getElementById('admStatusLog').textContent = '⚠️ Нет подключения к Supabase';
        return;
    }

    const { data, error } = await sb.from('sim_players').select('tg_id, username, balance').order('updated_at', { ascending: false }).limit(50);
    if (error) {
        document.getElementById('admStatusLog').textContent = `❌ Ошибка БД: ${error.message} (выполни SQL запрос в Supabase!)`;
        return;
    }

    document.getElementById('admStatusLog').textContent = `🟢 База подключена (игроков: ${data.length})`;
    selectEl.innerHTML = `<option value="${USER_ID}">👑 Я (${USER_NAME} — ${USER_ID})</option>` +
        data.filter(u => String(u.tg_id) !== USER_ID).map(u => 
            `<option value="${u.tg_id}">${u.username || 'Игрок'} (ID: ${u.tg_id}) — ${Number(u.balance || 0).toLocaleString()} $</option>`
        ).join('');
}

function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('show');
}

function selectAdminTarget(val) {
    if (val) document.getElementById('admTargetId').value = val;
}

function setAdminLog(msg, isError = false) {
    const el = document.getElementById('admStatusLog');
    if (el) {
        el.style.color = isError ? '#f87171' : '#34d399';
        el.textContent = msg;
    }
    showToast(msg);
}

// Вспомогательная загрузка или создание профиля целевого игрока в БД
async function getOrCreateTargetPlayer(targetId) {
    const { data, error } = await sb.from('sim_players').select('*').eq('tg_id', targetId).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;

    const freshProfile = {
        tg_id: targetId,
        username: `ID_${targetId}`,
        balance: 100,
        rolls: 0,
        earned: 0,
        best_drop: 0,
        secrets_count: 0,
        inventory: [],
        boosts: { luckUntil: 0, priceLevel: 0, fastSpin: false, vip888: false }
    };
    const { error: insErr } = await sb.from('sim_players').upsert(freshProfile);
    if (insErr) throw new Error(insErr.message);
    return freshProfile;
}

async function adminGiveCash() {
    const targetId = document.getElementById('admTargetId').value.trim();
    const amount = Number(document.getElementById('admCashAmount').value);
    if (!targetId || isNaN(amount)) return setAdminLog('❌ Укажи ID и сумму!', true);

    if (targetId === USER_ID) {
        state.balance += amount;
        animateBalanceTo(state.balance);
        saveGame();
        return setAdminLog(`✅ Выдано +${amount.toLocaleString()} $ себе на баланс!`);
    }

    if (!sb) return setAdminLog('❌ Нет связи с Supabase', true);
    try {
        const user = await getOrCreateTargetPlayer(targetId);
        const newBal = Number(user.balance || 0) + amount;
        const { error } = await sb.from('sim_players').update({
            balance: newBal,
            updated_at: new Date().toISOString()
        }).eq('tg_id', targetId);

        if (error) throw new Error(error.message);
        sfxCash();
        setAdminLog(`✅ Игроку ${targetId} начислено +${amount.toLocaleString()} $ (Баланс: ${newBal.toLocaleString()} $)!`);
        loadLeaderboard();
    } catch (err) {
        setAdminLog(`❌ Ошибка БД: ${err.message}`, true);
    }
}

async function adminGiveBoost() {
    const targetId = document.getElementById('admTargetId').value.trim();
    const boostType = document.getElementById('admBoostSelect').value;
    if (!targetId) return setAdminLog('❌ Укажи ID игрока!', true);

    const applyBoostLogic = (bObj) => {
        const b = { luckUntil: 0, priceLevel: 0, fastSpin: false, vip888: false, ...(bObj || {}) };
        if (boostType === 'luck' || boostType === 'all') {
            const base = Math.max(Date.now(), b.luckUntil || 0);
            b.luckUntil = base + 30 * 60 * 1000;
        }
        if (boostType === 'price' || boostType === 'all') {
            b.priceLevel = boostType === 'all' ? 5 : Math.min(5, (b.priceLevel || 0) + 1);
        }
        if (boostType === 'fast' || boostType === 'all') {
            b.fastSpin = true;
        }
        if (boostType === 'vip888' || boostType === 'all') {
            b.vip888 = true;
        }
        return b;
    };

    if (targetId === USER_ID) {
        state.boosts = applyBoostLogic(state.boosts);
        renderBoosts();
        renderRegionBar();
        saveGame();
        sfxCash();
        return setAdminLog('✅ Буст успешно активирован на твой аккаунт!');
    }

    if (!sb) return setAdminLog('❌ Нет связи с Supabase', true);
    try {
        const user = await getOrCreateTargetPlayer(targetId);
        const updatedBoosts = applyBoostLogic(user.boosts);

        const { error } = await sb.from('sim_players').update({
            boosts: updatedBoosts,
            updated_at: new Date().toISOString()
        }).eq('tg_id', targetId);

        if (error) throw new Error(error.message);
        sfxCash();
        setAdminLog(`🚀 Буст успешно выдан игроку ${targetId}!`);
    } catch (err) {
        setAdminLog(`❌ Ошибка БД: ${err.message}`, true);
    }
}

async function adminGiveNumber() {
    const targetId = document.getElementById('admTargetId').value.trim();
    const countryId = document.getElementById('admCountrySelect').value;
    const rarityId = document.getElementById('admRaritySelect').value;
    if (!targetId) return setAdminLog('❌ Укажи ID игрока!', true);

    const country = COUNTRIES.find(c => c.id === countryId) || COUNTRIES[0];
    const rarity = RARITIES.find(r => r.id === rarityId) || RARITIES[5];
    const giftItem = buildSimItem(country, rarity);

    if (targetId === USER_ID) {
        state.inventory.unshift(giftItem);
        saveGame();
        closeAdminModal();
        triggerCinematicModal(giftItem);
        return;
    }

    if (!sb) return setAdminLog('❌ Нет связи с Supabase', true);
    try {
        const user = await getOrCreateTargetPlayer(targetId);
        const updatedInv = [giftItem, ...(Array.isArray(user.inventory) ? user.inventory : [])];

        const { error } = await sb.from('sim_players').update({
            inventory: updatedInv,
            updated_at: new Date().toISOString()
        }).eq('tg_id', targetId);

        if (error) throw new Error(error.message);
        sfxCash();
        setAdminLog(`🎁 Номер ${giftItem.number} отправлен в сейф игроку ${targetId}!`);
    } catch (err) {
        setAdminLog(`❌ Ошибка БД: ${err.message}`, true);
    }
}

/* ==========================================================
   ЗАМОК НА НОМЕРА (БЛОКИРОВКА) И ПРОДАЖА
   ========================================================== */
function toggleLockItem(id) {
    const item = state.inventory.find(i => i.id === id);
    if (!item) return;
    item.locked = !item.locked;
    haptic('light');
    playTone(item.locked ? 600 : 380, 'sine', 0.06, 0.09);
    showToast(item.locked ? '🔒 Номер защищен и приносит пассивный доход!' : '🔓 Защита снята');
    saveGame();
}

function sellLastDrop(e) {
    if (!lastDroppedId) return;
    const idx = state.inventory.findIndex(i => i.id === lastDroppedId);
    if (idx === -1) return;
    const item = state.inventory[idx];
    if (item.locked) return showToast('🔒 Этот номер заблокирован!');

    state.balance += item.price;
    state.earned += item.price;
    state.inventory.splice(idx, 1);
    lastDroppedId = null;

    sfxCash();
    haptic('light');
    animateBalanceTo(state.balance);
    if (e?.clientX) spawnFloatingCash(e.clientX, e.clientY, item.price);
    document.getElementById('actionBar').classList.remove('visible');
    saveGame();
}

function sellFromInventory(id, e) {
    const idx = state.inventory.findIndex(i => i.id === id);
    if (idx === -1) return;
    const item = state.inventory[idx];

    if (item.locked) {
        haptic('warning');
        return showToast('🔒 Сними замок SAFE, чтобы продать этот номер!');
    }

    state.balance += item.price;
    state.earned += item.price;
    state.inventory.splice(idx, 1);

    if (lastDroppedId === id) {
        lastDroppedId = null;
        document.getElementById('actionBar').classList.remove('visible');
    }

    sfxCash();
    haptic('light');
    animateBalanceTo(state.balance);
    if (e?.clientX) spawnFloatingCash(e.clientX, e.clientY, item.price);
    saveGame();
}

function sellTrash(e) {
    const trash = state.inventory.filter(i => !i.locked && ['common', 'uncommon'].includes(i.rarity.id));
    if (trash.length === 0) return showToast('Нет открытых обычных номеров для слива');
    let sum = 0;
    trash.forEach(i => sum += i.price);
    state.balance += sum;
    state.earned += sum;
    state.inventory = state.inventory.filter(i => i.locked || !['common', 'uncommon'].includes(i.rarity.id));

    sfxCash();
    haptic('success');
    animateBalanceTo(state.balance);
    if (e?.clientX) spawnFloatingCash(e.clientX, e.clientY, sum);
    document.getElementById('actionBar').classList.remove('visible');
    showToast(`Слито ${trash.length} шт. за +${sum.toLocaleString()} $`);
    saveGame();
}

function sellAll(e) {
    const sellable = state.inventory.filter(i => !i.locked);
    if (sellable.length === 0) return showToast('Все номера в сейфе защищены замком SAFE!');

    let sum = 0;
    sellable.forEach(i => sum += i.price);
    const count = sellable.length;
    state.balance += sum;
    state.earned += sum;
    state.inventory = state.inventory.filter(i => i.locked);
    lastDroppedId = null;

    sfxCash();
    haptic('success');
    animateBalanceTo(state.balance);
    if (e?.clientX) spawnFloatingCash(e.clientX, e.clientY, sum);
    document.getElementById('actionBar').classList.remove('visible');
    showToast(`Продано ${count} шт. за +${sum.toLocaleString()} $ (🔒 сохранены)`);
    saveGame();
}

function giveFaucet(e) {
    if (state.balance >= 20) return showToast('Дотация доступна при балансе меньше 20 $');
    state.balance += 35;
    sfxCash();
    haptic('success');
    animateBalanceTo(state.balance);
    if (e?.clientX) spawnFloatingCash(e.clientX, e.clientY, 35);
    showToast('Зачислено +35 $ на баланс!');
    saveGame();
}

function animateBalanceTo(target) {
    const el = document.getElementById('balanceNum');
    const start = displayedBalance;
    const diff = target - start;
    if (diff === 0) { el.textContent = target.toLocaleString(); return; }
    const startTime = performance.now();
    function step(now) {
        const p = Math.min((now - startTime) / 300, 1);
        el.textContent = Math.round(start + diff * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
        else displayedBalance = target;
    }
    requestAnimationFrame(step);
}

function spawnFloatingCash(x, y, amount) {
    const el = document.createElement('div');
    el.className = 'floating-cash';
    el.textContent = `+${amount.toLocaleString()} $`;
    el.style.left = `${x - 30}px`;
    el.style.top = `${y - 20}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
}

function haptic(type) {
    if (!tg?.HapticFeedback) return;
    if (['light', 'medium', 'heavy'].includes(type)) tg.HapticFeedback.impactOccurred(type);
    else tg.HapticFeedback.notificationOccurred(type);
}

function updateUI() {
    document.getElementById('balanceNum').textContent = state.balance.toLocaleString();
    document.getElementById('invTitleCount').textContent = state.inventory.length;
    document.getElementById('dockCounter').textContent = state.inventory.length;

    const passivePerMin = getPassiveIncomePerMin();
    document.getElementById('passiveIncomeDisplay').textContent = `🔒 Пассив с сейфа: +${passivePerMin.toLocaleString()} $/мин`;

    document.getElementById('luckBadge').style.display = isLuckActive() ? 'block' : 'none';

    document.getElementById('statRolls').textContent = state.rolls.toLocaleString();
    document.getElementById('statEarned').textContent = `${state.earned.toLocaleString()} $`;
    document.getElementById('statBest').textContent = `${state.bestDrop.toLocaleString()} $`;
    document.getElementById('statSecrets').textContent = state.secretsCount;

    document.getElementById('refCountVal').textContent = `${state.referralsCount || 0} чел.`;
    document.getElementById('refEarnedVal').textContent = `${(state.refEarnings || 0).toLocaleString()} $`;

    // Отображение блока ввода реф-кода
    const manualBox = document.getElementById('manualRefBox');
    const claimedBox = document.getElementById('refAlreadyClaimedBox');
    if (manualBox && claimedBox) {
        if (state.referredBy) {
            manualBox.style.display = 'none';
            claimedBox.style.display = 'block';
            document.getElementById('claimedInviterId').textContent = state.referredBy;
        } else {
            manualBox.style.display = 'block';
            claimedBox.style.display = 'none';
        }
    }

    const list = document.getElementById('invList');
    if (state.inventory.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:var(--subtext); margin-top:50px; font-size:14px;">В сейфе пока пусто.<br>Выбивай блатные SIM-карты и +888 в Спиннере!</div>';
        return;
    }

    list.innerHTML = state.inventory.map(item => {
        const badge = item.rarity.isSecret
            ? `<span class="secret-blur" style="padding:2px 6px; border-radius:5px; font-weight:900;">SECRET</span>`
            : `<span style="color:${item.rarity.color}; font-weight:800;">${item.rarity.name}</span>`;
        const iconHtml = item.countryId === 'ANON'
            ? `<span>🏴‍☠️</span>`
            : `<img src="${item.flag}" alt="">`;

        const isLocked = !!item.locked;
        const itemPassive = Math.max(1, Math.floor((Number(item.price) || 0) * 0.02));

        return `
            <div class="inv-row-card ${isLocked ? 'is-locked' : ''}" style="border-left-color: ${item.rarity.color}">
                <div class="inv-info">
                    <div class="inv-phone-line">
                        ${iconHtml}
                        <span class="inv-phone-txt">${item.number}</span>
                    </div>
                    <div class="inv-sub-line">
                        ${badge} • <span>${item.patternTitle || item.countryName}</span>
                    </div>
                </div>
                <div class="inv-actions-right">
                    ${!isLocked ? `
                        <button class="upgrade-sim-btn" onclick="upgradeSimItem(${item.id})" title="Шанс 45% удвоить цену">
                            ⚡2X
                        </button>
                    ` : ''}

                    <button class="lock-btn ${isLocked ? 'locked' : ''}" onclick="toggleLockItem(${item.id})" title="Сейф-защита и пассивный доход">
                        <svg class="lock-svg" viewBox="0 0 24 24">
                            <path class="lock-shackle" d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            <rect x="3" y="11" width="18" height="11" rx="3" ry="3"></rect>
                            <circle cx="12" cy="16.5" r="1.5" fill="currentColor" stroke="none"></circle>
                        </svg>
                        ${isLocked ? `<span class="lock-status-txt">SAFE</span>` : ''}
                    </button>

                    <button class="inv-sell-trigger ${isLocked ? 'disabled-lock' : ''}" onclick="sellFromInventory(${item.id}, event)">
                        ${isLocked ? `+${itemPassive}$/м` : `+${item.price.toLocaleString()}$`}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-screen').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dock-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    btn.classList.add('active');
    if (tabId === 'boosts') renderBoosts();
    if (tabId === 'prof') loadLeaderboard();
    haptic('light');
}

let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2300);
}

initApp();