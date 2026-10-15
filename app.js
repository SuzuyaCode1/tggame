/* ==========================================================
   КОНФИГУРАЦИЯ ПРОЕКТА (SUPABASE + TELEGRAM + АДМИНКА)
   ========================================================== */
const SUPABASE_URL = 'https://kuahcdodqqbotuawsrat.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eO2K9Ts7jLGlZI8dS8xZdw_wSwcmC7F';
const BOT_USERNAME = 'sim_empire_bot';
const ADMIN_IDS = ['5268549164', '999999']; // Твой ID + тестовый ID для браузера

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// Инициализация Supabase (если ключи указаны)
let sb = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Данные текущего пользователя из Telegram
const tgUser = tg?.initDataUnsafe?.user || {
    id: '999999',
    first_name: 'Web',
    username: 'local_tester'
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
    { id: 'common', name: 'Обычный', chance: 65, min: 1, max: 4, color: '#94a3b8' },
    { id: 'uncommon', name: 'Необычный', chance: 22, min: 6, max: 18, color: '#10b981' },
    { id: 'rare', name: 'Редкий', chance: 9, min: 25, max: 90, color: '#3b82f6' },
    { id: 'mythic', name: 'Мифический', chance: 3, min: 150, max: 500, color: '#a855f7' },
    { id: 'legendary', name: 'Легендарный', chance: 0.85, min: 800, max: 2500, color: '#f59e0b' },
    { id: 'secret', name: 'SECRET', chance: 0.15, min: 5000, max: 25000, color: '#ff0055', isSecret: true }
];

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
   БАЗА ДАННЫХ (SUPABASE + LOCALSTORAGE FALLBACK) И РЕФЕРАЛЫ
   ========================================================== */
async function initApp() {
    document.getElementById('profName').textContent = USER_NAME;
    document.getElementById('profTgId').textContent = USER_ID;
    document.getElementById('admTargetId').value = USER_ID;

    // Проверка прав администратора
    if (ADMIN_IDS.includes(USER_ID)) {
        document.getElementById('openAdminBtn').style.display = 'inline-block';
    }

    // 1. Загружаем локальный сейв
    const localSaved = localStorage.getItem(`sim_empire_v5_${USER_ID}`);
    if (localSaved) {
        try { state = { ...state, ...JSON.parse(localSaved) }; } catch (e) {}
    }

    // 2. Синхронизация с Supabase (если подключен)
    if (sb) {
        document.getElementById('dbStatusDot').textContent = '☁️ CLOUD КАПИТАЛ';
        const { data, error } = await sb.from('sim_players').select('*').eq('tg_id', USER_ID).maybeSingle();
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
        } else if (!error) {
            await syncToSupabase();
        }
    }

    // 3. Обработка реферального входа (?startapp=ref_12345)
    await checkReferralStartParam();

    displayedBalance = state.balance;
    renderRegionBar();
    renderBoosts();
    updateUI();
}

async function syncToSupabase() {
    if (!sb) return;
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
}

function saveGame() {
    localStorage.setItem(`sim_empire_v5_${USER_ID}`, JSON.stringify(state));
    updateUI();
    syncToSupabase();
}

async function checkReferralStartParam() {
    const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams(window.location.search).get('startapp');
    if (!startParam || !startParam.startsWith('ref_')) return;

    const inviterId = startParam.replace('ref_', '');
    if (inviterId === USER_ID || state.referredBy) return;

    state.referredBy = inviterId;
    state.balance += 250;
    showToast('🎁 Бонус +250 $ за вход по приглашению!');

    if (sb) {
        const { data: inviter } = await sb.from('sim_players').select('*').eq('tg_id', inviterId).maybeSingle();
        if (inviter) {
            await sb.from('sim_players').update({
                balance: Number(inviter.balance) + 250,
                referrals_count: Number(inviter.referrals_count || 0) + 1,
                ref_earnings: Number(inviter.ref_earnings || 0) + 250
            }).eq('tg_id', inviterId);
        }
    }
    saveGame();
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

    // Эксклюзивные комбинации для +888
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

    // Базовая цена + множитель x10 для +888 + бонус прокачки цен
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
                ${luckActive ? 'Активно (+15м: 150$)' : '150 $'}
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
                ${state.boosts.fastSpin ? 'ВКЛ (Нажми выкл)' : '300 $'}
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
    const text = 'Залетай в SIM Empire! Выбивай блатные номера +888 и лутай +250$ бонуса по моей ссылке 🔥';
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
   АДМИН-ПАНЕЛЬ (ВЫДАЧА ВАЛЮТЫ И НОМЕРОВ ИГРОКАМ)
   ========================================================== */
function openAdminModal() {
    document.getElementById('adminModal').classList.add('show');
}
function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('show');
}

async function adminGiveCash() {
    const targetId = document.getElementById('admTargetId').value.trim();
    const amount = Number(document.getElementById('admCashAmount').value);
    if (!targetId || isNaN(amount)) return showToast('Укажи ID и сумму');

    if (targetId === USER_ID) {
        state.balance += amount;
        animateBalanceTo(state.balance);
        saveGame();
        showToast(`✅ Выдано ${amount} $ себе на баланс`);
        return;
    }

    if (!sb) return showToast('Для выдачи другим игрокам подключи ключи Supabase в app.js');
    const { data: user } = await sb.from('sim_players').select('balance').eq('tg_id', targetId).maybeSingle();
    if (!user) return showToast('Игрок с таким ID не найден в БД');

    await sb.from('sim_players').update({ balance: Number(user.balance) + amount }).eq('tg_id', targetId);
    showToast(`✅ Игроку ${targetId} начислено +${amount} $!`);
}

async function adminGiveNumber() {
    const targetId = document.getElementById('admTargetId').value.trim();
    const countryId = document.getElementById('admCountrySelect').value;
    const rarityId = document.getElementById('admRaritySelect').value;

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

    if (!sb) return showToast('Для отправки другим игрокам подключи ключи Supabase');
    const { data: user } = await sb.from('sim_players').select('inventory').eq('tg_id', targetId).maybeSingle();
    if (!user) return showToast('Игрок не найден в БД');

    const updatedInv = [giftItem, ...(user.inventory || [])];
    await sb.from('sim_players').update({ inventory: updatedInv }).eq('tg_id', targetId);
    showToast(`🎁 Номер ${giftItem.number} отправлен игроку ${targetId}!`);
}

async function adminGiveLuck() {
    const targetId = document.getElementById('admTargetId').value.trim();
    const until = Date.now() + 30 * 60 * 1000;

    if (targetId === USER_ID) {
        state.boosts.luckUntil = until;
        saveGame();
        renderBoosts();
        showToast('🍀 Выдана Удача 2X на 30 минут!');
        return;
    }

    if (!sb) return showToast('Подключи Supabase для выдачи другим игрокам');
    const { data: user } = await sb.from('sim_players').select('boosts').eq('tg_id', targetId).maybeSingle();
    if (!user) return showToast('Игрок не найден');

    const newBoosts = { ...(user.boosts || {}), luckUntil: until };
    await sb.from('sim_players').update({ boosts: newBoosts }).eq('tg_id', targetId);
    showToast(`🍀 Удача 2X выдана игроку ${targetId}!`);
}

/* ==========================================================
   ПРОДАЖА И ОБНОВЛЕНИЕ UI
   ========================================================== */
function sellLastDrop(e) {
    if (!lastDroppedId) return;
    const idx = state.inventory.findIndex(i => i.id === lastDroppedId);
    if (idx === -1) return;
    const item = state.inventory[idx];
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
    const trash = state.inventory.filter(i => ['common', 'uncommon'].includes(i.rarity.id));
    if (trash.length === 0) return showToast('Нет обычных номеров для слива');
    let sum = 0;
    trash.forEach(i => sum += i.price);
    state.balance += sum;
    state.earned += sum;
    state.inventory = state.inventory.filter(i => !['common', 'uncommon'].includes(i.rarity.id));

    sfxCash();
    haptic('success');
    animateBalanceTo(state.balance);
    if (e?.clientX) spawnFloatingCash(e.clientX, e.clientY, sum);
    document.getElementById('actionBar').classList.remove('visible');
    showToast(`Слито ${trash.length} шт. за +${sum.toLocaleString()} $`);
    saveGame();
}

function sellAll(e) {
    if (state.inventory.length === 0) return;
    let sum = 0;
    state.inventory.forEach(i => sum += i.price);
    const count = state.inventory.length;
    state.balance += sum;
    state.earned += sum;
    state.inventory = [];
    lastDroppedId = null;

    sfxCash();
    haptic('success');
    animateBalanceTo(state.balance);
    if (e?.clientX) spawnFloatingCash(e.clientX, e.clientY, sum);
    document.getElementById('actionBar').classList.remove('visible');
    showToast(`Продано ${count} шт. за +${sum.toLocaleString()} $`);
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

    document.getElementById('luckBadge').style.display = isLuckActive() ? 'block' : 'none';

    document.getElementById('statRolls').textContent = state.rolls.toLocaleString();
    document.getElementById('statEarned').textContent = `${state.earned.toLocaleString()} $`;
    document.getElementById('statBest').textContent = `${state.bestDrop.toLocaleString()} $`;
    document.getElementById('statSecrets').textContent = state.secretsCount;

    document.getElementById('refCountVal').textContent = `${state.referralsCount || 0} чел.`;
    document.getElementById('refEarnedVal').textContent = `${(state.refEarnings || 0).toLocaleString()} $`;

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

        return `
            <div class="inv-row-card" style="border-left-color: ${item.rarity.color}">
                <div class="inv-info">
                    <div class="inv-phone-line">
                        ${iconHtml}
                        <span class="inv-phone-txt">${item.number}</span>
                    </div>
                    <div class="inv-sub-line">
                        ${badge} • <span>${item.patternTitle || item.countryName}</span>
                    </div>
                </div>
                <button class="inv-sell-trigger" onclick="sellFromInventory(${item.id}, event)">
                    +${item.price.toLocaleString()} $
                </button>
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