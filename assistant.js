import { saveToStorage, loadFromStorage, randomInt, showToast, LS_GEMINI_API_KEY } from './shared.js';
import { hasGeminiBackend, askGemini } from './services/gemini.js';

const STORAGE_KEY = 'crowdpilotAssistantChat';
/** @deprecated use LS_GEMINI_API_KEY from shared.js */
export const GEMINI_KEY_STORAGE = LS_GEMINI_API_KEY;
const VOICE_AUTOSEND_KEY = 'crowdpilot_voice_autosend';

/** @typedef {{ type: 'route'|'queue'|'alert'|'parking', title: string, body: string, badge?: string, meta?: string, cta?: string, href?: string, icon?: string }} Card */

/**
 * @param {unknown} raw
 * @returns {{ text: string, cards?: Card[] } | null}
 */
function normalizeGeminiReply(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return { text: raw };
  if (typeof raw === 'object' && 'text' in raw && typeof raw.text === 'string') {
    return { text: raw.text, cards: Array.isArray(raw.cards) ? raw.cards : undefined };
  }
  return null;
}

const INTENTS = [
  {
    id: 'emergency',
    match: (t) =>
      /\b(emergency|evacuat|sos|must leave now|fire alarm|panic)\b/i.test(t) ||
      /\bemergency\s+(exit|door|route)/i.test(t),
  },
  {
    id: 'washroom',
    match: (t) =>
      /\b(washroom|restroom|toilet|bathroom|loo|\bwc\b|urinal)\b/i.test(t) ||
      /\bnearest\s+(wc|rest|bath)/i.test(t),
  },
  {
    id: 'food',
    match: (t) =>
      /\b(food|snack|eat|hungry|grill|stall|vendor|queue|line|bbq|beer|concession)\b/i.test(
        t,
      ) && !/\bexit\b/i.test(t),
  },
  {
    id: 'exit',
    match: (t) =>
      /\b(fastest\s+exit|quickest\s+exit|leave\s+fast|get\s+out\s+faster|exit\s+route|way\s+out|after\s+the\s+game|after\s+the\s+match|post[\s-]?game\s+exit)\b/i.test(
        t,
      ) ||
      (/\bhow\s+do\s+i\s+leave\b/i.test(t) && !/\bemergency\b/i.test(t)),
  },
  {
    id: 'gate',
    match: (t) =>
      /\b(least\s+crowded|quietest|best\s+gate|which\s+gate|gate\s+to\s+use|enter|entry)\b/i.test(
        t,
      ) || /\bcrowd(ed)?\s+gate\b/i.test(t),
  },
  {
    id: 'parking',
    match: (t) =>
      /\b(parking|lot\s+[a-z]|garage|car|drive|traffic\s+out)\b/i.test(t) &&
      !/\bfood\s+queue\b/i.test(t),
  },
  {
    id: 'halftime',
    match: (t) =>
      /\b(halftime|half\s*time|intermission|between\s+quarters|beat\s+the\s+crowd)\b/i.test(t),
  },
  {
    id: 'accessibility',
    match: (t) =>
      /\b(accessible|accessibility|wheelchair|ramp|elevator|mobility|ada|stroller)\b/i.test(t),
  },
  {
    id: 'greeting',
    match: (t) => {
      const s = t.trim();
      if (
        /\b(washroom|restroom|toilet|bathroom|food|exit|gate|parking|halftime|emergency|accessible|wheelchair|queue|stall|route)\b/i.test(
          s,
        )
      ) {
        return false;
      }
      return /^(hi|hello|hey|yo|sup|good\s+(morning|afternoon|evening))\b/i.test(s);
    },
  },
];

/** @type {Record<string, { paragraphs: string[], cards?: Card[] }[]>} */
const RESPONSE_BANK = {
  greeting: [
    {
      paragraphs: [
        'Hello — I am your CrowdPilot stadium companion. Add an optional Gemini API key under Profile for live AI answers, or stay in fast on-device mode anytime.',
        'Ask me about washrooms, food queues, exits, gates, parking, halftime crowds, accessibility, or emergencies. You can tap a chip, type, or use the mic where supported.',
      ],
      cards: [
        {
          type: 'route',
          icon: 'map',
          title: 'Stadium map',
          body: 'Open the live map when you want to sanity-check a route.',
          badge: 'Open',
          meta: 'Navigate',
          cta: 'Map',
          href: 'map.html',
        },
        {
          type: 'queue',
          icon: 'analytics',
          title: 'Queue analytics',
          body: 'Dive deeper into food and restroom trends.',
          badge: 'Explore',
          meta: 'Queues',
          cta: 'Queues',
          href: 'queue.html',
        },
      ],
    },
    {
      paragraphs: [
        'Hey! I am running in on-device keyword mode — fast, private, and ready for gameday questions.',
        'Try “shortest food queue”, “nearest washroom”, or “least crowded gate” whenever you are ready.',
      ],
      cards: [
        {
          type: 'alert',
          icon: 'notifications',
          title: 'Alerts',
          body: 'Gate and congestion notices land here first.',
          badge: 'Live',
          meta: 'Venue',
          cta: 'Alerts',
          href: 'alerts.html',
        },
      ],
    },
  ],
  emergency: [
    {
      paragraphs: [
        'For emergencies, follow venue staff and illuminated exit signs immediately. Do not use elevators unless directed.',
        'Nearest marked emergency exits from Section B12: North stairwell (Level 2) and Gate B service corridor. Move calmly toward the nearest green exit light.',
      ],
      cards: [
        {
          type: 'alert',
          icon: 'emergency',
          title: 'Emergency exits map',
          body: 'Tap for evacuation routes, muster zones, and SOS check-in.',
          badge: 'Live',
          meta: 'Safety priority',
          cta: 'Open',
          href: 'emergency.html',
        },
        {
          type: 'route',
          icon: 'directions_run',
          title: 'Staff-assisted route',
          body: 'Ramps on the east wing stay clear for emergency flow — avoid central atrium.',
          badge: 'Reroute',
          meta: 'Use if directed',
          cta: 'Routes',
          href: 'routes.html',
        },
      ],
    },
    {
      paragraphs: [
        'CrowdPilot flags emergency egress separately from normal exits. If you hear an alarm, take the closest stairwell down and out — avoid main concourse crush points.',
        'Gate B and the north plaza exits typically stay less congested during evacuations from your zone.',
      ],
      cards: [
        {
          type: 'alert',
          icon: 'warning',
          title: 'Venue alert channel',
          body: 'Official updates and hold instructions may post here during incidents.',
          badge: 'Monitor',
          meta: 'Stay informed',
          cta: 'Alerts',
          href: 'alerts.html',
        },
      ],
    },
  ],
  washroom: [
    {
      paragraphs: [
        'Closest low-wait option: Level 2 West restrooms — about a 2 minute walk from Section B12. Sensors show short lines right now.',
        'If that level fills up, try Level 1 near Gate 9; it is usually quieter during the 3rd quarter.',
      ],
      cards: [
        {
          type: 'queue',
          icon: 'wc',
          title: 'Level 2 West',
          body: 'Typically the fastest washroom run from your section this half.',
          badge: '~2 min',
          meta: 'Live queue',
          cta: 'Map',
          href: 'map.html',
        },
      ],
    },
    {
      paragraphs: [
        'Nearest washroom cluster is west on your concourse. I am routing you away from the south restrooms — they are spiking with halftime prep traffic.',
      ],
      cards: [
        {
          type: 'queue',
          icon: 'hourglass_empty',
          title: 'Avoid South pods',
          body: 'Queues building — Level 1 alternative trending “no wait”.',
          badge: 'Trend',
          meta: 'Rising wait',
          cta: 'Queues',
          href: 'queue.html',
        },
      ],
    },
  ],
  food: [
    {
      paragraphs: [
        'Shortest food queue near you: North Wing BBQ (Section A side) — roughly 2 minutes walk, ~2 minute wait.',
        'Runner-up: Zen Sushi Bar in Section C if you want lighter lines with a slightly longer walk.',
      ],
      cards: [
        {
          type: 'queue',
          icon: 'restaurant',
          title: 'North Wing BBQ',
          body: 'Best combo of distance + wait time from B12 right now.',
          badge: '~2 min',
          meta: 'Top pick',
          cta: 'Queues',
          href: 'queue.html',
        },
        {
          type: 'route',
          icon: 'directions_walk',
          title: 'Walk-up route',
          body: 'Use the north mezzanine cut-through to skip the main atrium.',
          badge: '-3 min',
          meta: 'Less crowd',
          cta: 'Routes',
          href: 'routes.html',
        },
      ],
    },
    {
      paragraphs: [
        'Live counters favor the north concessions tonight. If lines look long on the app, the satellite grill behind Section 108 often clears faster than the main stand.',
      ],
      cards: [
        {
          type: 'queue',
          icon: 'restaurant',
          title: 'Satellite grill · 108',
          body: 'Hidden gem when the main queue backs up.',
          badge: 'Alt',
          meta: 'Often faster',
          cta: 'Map',
          href: 'map.html',
        },
      ],
    },
  ],
  exit: [
    {
      paragraphs: [
        'Fastest routine exit from B12 tonight: Gate 9 — about 6 minutes walk with clearer flow than Gate 4.',
        'After the final buzzer, head out within ~8 minutes if you want to beat the parking surge.',
      ],
      cards: [
        {
          type: 'route',
          icon: 'logout',
          title: 'Gate 9 exit path',
          body: 'Uses the west ramp — fewer stairs and less merging than the south tunnel.',
          badge: '6 min',
          meta: 'From B12',
          cta: 'Routes',
          href: 'routes.html',
        },
      ],
    },
    {
      paragraphs: [
        'Gate 11 pairs well with Parking Lot C if you are driving — slightly longer walk but less merge chaos than the main plaza.',
      ],
      cards: [
        {
          type: 'parking',
          icon: 'directions_car',
          title: 'Lot C pairing',
          body: 'Match exit gate to your lot for the shortest post-game drive queue.',
          badge: 'Drive',
          meta: 'Parking',
          cta: 'Dashboard',
          href: 'dashboard.html',
        },
      ],
    },
  ],
  gate: [
    {
      paragraphs: [
        'Least crowded gate for entry / re-entry near your zone: Gate B — lighter inflow than Gate 4 right now.',
        'If you are re-entering after a break, scan times at Gate B are trending faster on the north plaza side.',
      ],
      cards: [
        {
          type: 'route',
          icon: 'door_front',
          title: 'Gate B inflow',
          body: 'Better balance of walk time vs. queue depth for B12 ticket holders.',
          badge: 'Lower wait',
          meta: 'vs Gate 4',
          cta: 'Map',
          href: 'map.html',
        },
      ],
    },
    {
      paragraphs: [
        'Crowd heatmaps show Gate 4 still congested. I would approach from the north ribbon and use Gate B unless staff directs otherwise.',
      ],
      cards: [
        {
          type: 'alert',
          icon: 'groups',
          title: 'Gate 4 congestion',
          body: 'Delay risk elevated — check again before you move.',
          badge: 'Busy',
          meta: 'Avoid if possible',
          cta: 'Alerts',
          href: 'alerts.html',
        },
      ],
    },
  ],
  parking: [
    {
      paragraphs: [
        'Parking Lot C is showing moderate congestion exiting — expect a few extra minutes to reach the arterial.',
        'If you have flexibility post-game, waiting 10 minutes inside often shaves more time than joining the instant crush.',
      ],
      cards: [
        {
          type: 'parking',
          icon: 'directions_car',
          title: 'Lot C status',
          body: 'Stagger exit or use Gate 11 pairing for smoother merge onto the ring road.',
          badge: 'Moderate',
          meta: 'Exit queue',
          cta: 'Dashboard',
          href: 'dashboard.html',
        },
        {
          type: 'route',
          icon: 'alt_route',
          title: 'Alternate spiral',
          body: 'East ramp sometimes clears before the main garage helix.',
          badge: 'Try if stuck',
          meta: 'Dynamic',
          cta: 'Routes',
          href: 'routes.html',
        },
      ],
    },
    {
      paragraphs: [
        'Garage sensors show the west spiral backing up faster than east. If you are still inside, favor east-down when signs allow.',
      ],
      cards: [
        {
          type: 'parking',
          icon: 'traffic',
          title: 'Spiral balance',
          body: 'Short detours can beat a single packed lane.',
          badge: 'Tip',
          meta: 'Live-ish',
          cta: 'Map',
          href: 'map.html',
        },
      ],
    },
  ],
  halftime: [
    {
      paragraphs: [
        'Halftime crowd will peak around the main concourse and south restrooms. Leave your seat about 8–10 minutes before the break if you want snacks without the surge.',
        'North concessions and Level 2 west washrooms historically clear fastest for your section.',
      ],
      cards: [
        {
          type: 'queue',
          icon: 'schedule',
          title: 'Beat the rush',
          body: 'Pre-walk before the horn to skip the worst lines.',
          badge: '8–10 min',
          meta: 'Timing',
          cta: 'Queues',
          href: 'queue.html',
        },
        {
          type: 'route',
          icon: 'directions_run',
          title: 'Halftime loop',
          body: 'Short north loop avoids the south bottleneck near Gate 4.',
          badge: 'Plan',
          meta: 'Low stress',
          cta: 'Routes',
          href: 'routes.html',
        },
      ],
    },
    {
      paragraphs: [
        'If you wait until the buzzer, expect +5–8 minutes on food and restrooms. Hydrate at your seat now and pick a single objective for the break.',
      ],
      cards: [
        {
          type: 'alert',
          icon: 'notifications',
          title: 'Halftime alerts',
          body: 'Sudden queue spikes get posted here — worth a glance before you stand up.',
          badge: 'Heads-up',
          meta: 'Live',
          cta: 'Alerts',
          href: 'alerts.html',
        },
      ],
    },
  ],
  accessibility: [
    {
      paragraphs: [
        'Accessible routes from B12: prefer elevators on the north side and the east ramp series — wider landings and fewer stair-only cut-throughs.',
        'Staff can unlock priority lanes at Gate B during peak crush; ask any yellow-vest team member.',
      ],
      cards: [
        {
          type: 'route',
          icon: 'accessible',
          title: 'Ramp-first path',
          body: 'East wing keeps continuous roll paths to restrooms and concessions.',
          badge: 'ADA',
          meta: 'Verified map',
          cta: 'Map',
          href: 'map.html',
        },
        {
          type: 'route',
          icon: 'elevator',
          title: 'Elevator bank N2',
          body: 'Less backup than south bank during halftime.',
          badge: 'Lift',
          meta: 'Preference',
          cta: 'Routes',
          href: 'routes.html',
        },
      ],
    },
    {
      paragraphs: [
        'If you need a seated rest mid-route, the north club landing has benches away from the main flow. I will keep routing you on level changes with working elevators only.',
      ],
      cards: [
        {
          type: 'alert',
          icon: 'info',
          title: 'Service changes',
          body: 'Rare elevator holds are announced on Alerts — check before you move floors.',
          badge: 'Check',
          meta: 'Accessibility',
          cta: 'Alerts',
          href: 'alerts.html',
        },
      ],
    },
  ],
  fallback: [
    {
      paragraphs: [
        'I can help with washrooms, food queues, exits, gates, parking, halftime timing, accessibility, and emergencies. Try one of the chips below or ask in your own words.',
      ],
      cards: [
        {
          type: 'route',
          icon: 'psychology',
          title: 'Try asking',
          body: '“Shortest food queue”, “nearest washroom”, or “fastest exit”.',
          badge: 'Tip',
          meta: 'Local AI',
          cta: 'Assistant',
          href: 'assistant.html',
        },
      ],
    },
    {
      paragraphs: [
        'Using local stadium mode (no Gemini reply this turn). Ask about queues, routes, gates, parking, or halftime — I pattern-match your intent with built-in mock logic.',
      ],
    },
  ],
};

function detectIntent(text) {
  const t = text.trim();
  for (const rule of INTENTS) {
    if (rule.id === 'greeting') continue;
    if (rule.match(t)) return rule.id;
  }
  const greet = INTENTS.find((r) => r.id === 'greeting');
  if (greet && greet.match(t)) return 'greeting';
  return 'fallback';
}

function pickPack(intentId) {
  const packs = RESPONSE_BANK[intentId] || RESPONSE_BANK.fallback;
  return packs[randomInt(0, packs.length - 1)];
}

export function buildLocalReply(userMessage) {
  const intent = detectIntent(userMessage);
  const pack = pickPack(intent);
  return {
    intent,
    paragraphs: pack.paragraphs,
    cards: pack.cards || [],
  };
}

/**
 * Resolve assistant content — swap Gemini in here without touching UI code.
 * @param {string} userMessage
 */
export async function resolveAssistantReply(userMessage) {
  if (await hasGeminiBackend()) {
    try {
      const raw = await askGemini(userMessage);
      const normalized = normalizeGeminiReply(raw);
      if (normalized) {
        return {
          source: 'gemini',
          intent: 'gemini',
          paragraphs: normalized.text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean),
          cards: normalized.cards || [],
        };
      }
    } catch {
      /* fall through to local keyword assistant */
    }
  }
  const local = buildLocalReply(userMessage);
  return { source: 'local', ...local };
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function injectAssistantStyles() {
  if (document.getElementById('assistant-module-styles')) return;
  const s = document.createElement('style');
  s.id = 'assistant-module-styles';
  s.textContent = `
    [data-assistant-input]:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    #voice-btn.cp-mic-listening {
      color: #ff6b00 !important;
      background: rgba(255,107,0,0.2) !important;
      animation: cp-mic-pulse 1.1s ease-in-out infinite;
      box-shadow: 0 0 0 0 rgba(255,107,0,0.45);
    }
    #voice-btn.cp-mic-stop {
      color: #a8a29e !important;
      background: rgba(255,255,255,0.08) !important;
      animation: none;
    }
    @keyframes cp-mic-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,0,0.45); }
      50% { box-shadow: 0 0 0 14px rgba(255,107,0,0); }
    }
  `;
  document.head.appendChild(s);
}

/**
 * @param {object} p
 * @param {HTMLInputElement} p.input
 * @param {(text: string) => void} p.sendFromUser
 * @param {HTMLButtonElement | null} p.voiceBtn
 * @param {HTMLElement | null} p.statusEl
 * @param {HTMLInputElement | null} p.autosendEl
 */
function wireWebSpeech(p) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!p.voiceBtn) return;
  if (!Rec) {
    p.voiceBtn.disabled = true;
    p.voiceBtn.title = 'Voice input is not supported in this browser';
    if (p.statusEl) p.statusEl.textContent = 'Voice not supported';
    return;
  }

  const rec = new Rec();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.continuous = false;

  let listening = false;

  function autosendOn() {
    if (p.autosendEl) return p.autosendEl.checked;
    return !!loadFromStorage(VOICE_AUTOSEND_KEY, false);
  }

  function setMicState(mode) {
    p.voiceBtn.classList.remove('cp-mic-listening', 'cp-mic-stop');
    if (mode === 'listening') {
      p.voiceBtn.classList.add('cp-mic-listening');
      p.voiceBtn.setAttribute('aria-pressed', 'true');
      p.voiceBtn.setAttribute('aria-label', 'Stop listening');
      if (p.statusEl) p.statusEl.textContent = 'Listening… speak now';
    } else if (mode === 'stop') {
      p.voiceBtn.classList.add('cp-mic-stop');
      p.voiceBtn.setAttribute('aria-pressed', 'false');
      if (p.statusEl) p.statusEl.textContent = 'Stopped';
      window.setTimeout(() => {
        if (p.statusEl && p.statusEl.textContent === 'Stopped') p.statusEl.textContent = '';
        p.voiceBtn?.classList.remove('cp-mic-stop');
      }, 900);
    } else {
      p.voiceBtn.classList.remove('cp-mic-stop');
      p.voiceBtn.setAttribute('aria-pressed', 'false');
      p.voiceBtn.setAttribute('aria-label', 'Start voice input');
      if (p.statusEl) p.statusEl.textContent = '';
    }
  }

  p.voiceBtn.addEventListener('click', () => {
    if (listening) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      listening = false;
      setMicState('stop');
      return;
    }
    try {
      rec.start();
      listening = true;
      setMicState('listening');
    } catch {
      listening = false;
      setMicState('idle');
      showToast('Could not start microphone. Check permissions.', { type: 'error' });
    }
  });

  rec.onend = () => {
    listening = false;
  };

  rec.onerror = () => {
    listening = false;
    setMicState('idle');
    showToast('Voice input error. Try again or type your message.', { type: 'error', duration: 4000 });
  };

  rec.onresult = (ev) => {
    const text = ev.results?.[0]?.[0]?.transcript?.trim() || '';
    listening = false;
    setMicState('idle');
    if (!text) return;
    p.input.value = text;
    if (autosendOn()) p.sendFromUser(text);
  };

  if (p.autosendEl) {
    p.autosendEl.checked = !!loadFromStorage(VOICE_AUTOSEND_KEY, false);
    p.autosendEl.addEventListener('change', () => {
      saveToStorage(VOICE_AUTOSEND_KEY, p.autosendEl.checked);
    });
  }
}

function cardIconMaterial(name) {
  return name || 'chevron_right';
}

function renderCard(card) {
  const wrap = document.createElement('div');
  wrap.className = 'context-card p-5 cursor-pointer group';
  if (card.href) {
    wrap.addEventListener('click', () => {
      window.location.href = card.href;
    });
  }
  const icon = cardIconMaterial(card.icon);
  wrap.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-tertiary text-base" style="font-variation-settings:'FILL' 1;">${icon}</span>
        <span class="text-[10px] font-bold uppercase tracking-widest text-stone-500">${cardTypeLabel(card.type)}</span>
      </div>
      ${card.badge ? `<span class="text-[10px] bg-white/05 text-stone-400 px-2 py-0.5 rounded-full font-bold">${escapeHtml(card.badge)}</span>` : ''}
    </div>
    <h4 class="font-bold text-sm mb-1 group-hover:text-primary-container glide">${escapeHtml(card.title)}</h4>
    <p class="text-xs text-stone-400">${escapeHtml(card.body)}</p>
    <div class="mt-3 pt-3 border-t border-white/05 flex justify-between items-center">
      ${card.meta ? `<span class="text-[10px] text-stone-600 font-bold uppercase">${escapeHtml(card.meta)}</span>` : '<span></span>'}
      ${card.cta && card.href ? `<span class="text-xs text-primary-container font-bold flex items-center gap-1">${escapeHtml(card.cta)} <span class="material-symbols-outlined text-sm">arrow_forward</span></span>` : ''}
    </div>
  `;
  return wrap;
}

function cardTypeLabel(type) {
  const map = {
    route: 'Route',
    queue: 'Queue',
    alert: 'Alert',
    parking: 'Parking',
  };
  return map[type] || 'Tip';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scrollMessagesToEnd(container) {
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function setThinking(root, on) {
  const el = root.querySelector('#typing-indicator');
  if (!el) return;
  el.style.display = on ? 'flex' : 'none';
}

function createUserRow(text, ts) {
  const row = document.createElement('div');
  row.className = 'flex gap-5 max-w-4xl ml-auto flex-row-reverse';
  row.setAttribute('data-role', 'user');
  row.innerHTML = `
    <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-primary-container/30 shrink-0 mt-1">
      <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&q=80" class="w-full h-full object-cover" alt=""/>
    </div>
    <div class="flex flex-col items-end gap-1 max-w-sm">
      <div class="chat-bubble-user p-5 w-full">
        <p class="text-stone-100 leading-relaxed assistant-user-text"></p>
      </div>
      <span class="text-[10px] text-stone-500 px-1">${escapeHtml(formatTime(ts))}</span>
    </div>
  `;
  row.querySelector('.assistant-user-text').textContent = text;
  return row;
}

function createAssistantShell(ts) {
  const row = document.createElement('div');
  row.className = 'flex gap-5 max-w-4xl';
  row.setAttribute('data-role', 'assistant');
  row.innerHTML = `
    <div class="w-10 h-10 rounded-full bg-surface-container border border-white/08 flex items-center justify-center shrink-0 mt-1">
      <span class="material-symbols-outlined text-primary-container text-xl" style="font-variation-settings:'FILL' 1;">smart_toy</span>
    </div>
    <div class="space-y-5 flex-1 min-w-0">
      <div class="chat-bubble-ai p-6 inline-block max-w-2xl">
        <div class="assistant-typed-body text-stone-200 leading-relaxed space-y-2"></div>
        <p class="text-[10px] text-stone-500 mt-3 assistant-msg-time">${escapeHtml(formatTime(ts))}</p>
      </div>
      <div class="assistant-cards grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl hidden"></div>
    </div>
  `;
  return row;
}

function typeParagraphs(bodyEl, paragraphs, msPerChar, onDone) {
  const full = paragraphs.join('\n\n');
  let i = 0;
  bodyEl.textContent = '';
  bodyEl.style.whiteSpace = 'pre-line';

  function tick() {
    if (i >= full.length) {
      bodyEl.style.whiteSpace = '';
      const parts = paragraphs;
      bodyEl.textContent = '';
      parts.forEach((p, idx) => {
        const pEl = document.createElement('p');
        pEl.className = 'leading-relaxed' + (idx > 0 ? ' mt-2' : '');
        pEl.textContent = p;
        bodyEl.appendChild(pEl);
      });
      onDone();
      return;
    }
    bodyEl.textContent = full.slice(0, i + 1);
    i += 1;
    window.setTimeout(tick, msPerChar);
  }

  tick();
}

/**
 * @param {object} options
 * @param {string} [options.messagesSelector]
 * @param {string} [options.inputSelector]
 * @param {string} [options.sendButtonSelector]
 * @param {string} [options.chipSelector]
 * @param {string} [options.voiceButtonSelector]
 * @param {string} [options.voiceStatusSelector]
 * @param {string} [options.voiceAutosendSelector]
 */
export function initAssistant(options = {}) {
  injectAssistantStyles();

  hasGeminiBackend().then(isConnected => {
    if (isConnected) {
      const existingBadge = document.querySelector('#gemini-enabled-badge');
      const headerRow = document.querySelector('h1');
      if (!existingBadge && headerRow) {
        const badge = document.createElement('span');
        badge.id = 'gemini-enabled-badge';
        badge.innerHTML = '<span class="material-symbols-outlined text-[10px] align-middle mr-1" style="font-variation-settings:\'FILL\' 1;">bolt</span>Gemini Enabled';
        badge.className = 'ml-3 text-[10px] bg-tertiary/20 text-tertiary px-2 py-0.5 rounded-full border border-tertiary/30 align-middle inline-flex items-center tracking-widest uppercase font-bold relative -top-1';
        headerRow.appendChild(badge);
      }
    }
  });

  const sel = {
    messages: options.messagesSelector || '#chat-messages',
    input: options.inputSelector || '#chat-input',
    send: options.sendButtonSelector || '#assistant-send',
    chip: options.chipSelector || '[data-assistant-chip]',
    voice: options.voiceButtonSelector || '#voice-btn',
    voiceStatus: options.voiceStatusSelector || '#assistant-voice-status',
    voiceAutosend: options.voiceAutosendSelector || '#assistant-voice-autosend',
  };

  const container = document.querySelector(sel.messages);
  const input = document.querySelector(sel.input);
  const sendBtn = document.querySelector(sel.send);
  if (!container || !input) return null;

  Array.from(container.children).forEach((ch) => {
    if (ch.id === 'typing-indicator' || ch.id === 'cp-assistant-skeleton') return;
    ch.remove();
  });

  const typingEl = container.querySelector('#typing-indicator');
  if (typingEl) typingEl.style.display = 'none';

  /** @type {{ role: string, text: string, ts: string, paragraphs?: string[], cards?: Card[] }[]} */
  let history = loadFromStorage(STORAGE_KEY, []) || [];

  function persist() {
    saveToStorage(STORAGE_KEY, history);
  }

  function appendUserToDom(text, ts) {
    const row = createUserRow(text, ts);
    if (typingEl) container.insertBefore(row, typingEl);
    else container.appendChild(row);
    scrollMessagesToEnd(container);
  }

  function appendAssistantToDom(paragraphs, cards, ts, { animateTyping = true } = {}) {
    const row = createAssistantShell(ts);
    const bodyEl = row.querySelector('.assistant-typed-body');
    const cardsEl = row.querySelector('.assistant-cards');
    if (typingEl) container.insertBefore(row, typingEl);
    else container.appendChild(row);

    const revealCards = () => {
      if (cards?.length && cardsEl) {
        cardsEl.classList.remove('hidden');
        cards.forEach((c) => cardsEl.appendChild(renderCard(c)));
      }
      scrollMessagesToEnd(container);
    };

    if (animateTyping && paragraphs.length) {
      typeParagraphs(bodyEl, paragraphs, 12, revealCards);
    } else {
      bodyEl.textContent = '';
      paragraphs.forEach((p, idx) => {
        const pEl = document.createElement('p');
        pEl.className = 'leading-relaxed' + (idx > 0 ? ' mt-2' : '');
        pEl.textContent = p;
        bodyEl.appendChild(pEl);
      });
      revealCards();
    }
    scrollMessagesToEnd(container);
  }

  function renderHistoryFromStorage() {
    container.querySelectorAll('[data-role]').forEach((n) => n.remove());

    history.forEach((msg) => {
      if (msg.role === 'user') appendUserToDom(msg.text, msg.ts);
      if (msg.role === 'assistant') {
        const paras = msg.paragraphs?.length ? msg.paragraphs : [msg.text || ''];
        appendAssistantToDom(paras, msg.cards || [], msg.ts, {
          animateTyping: false,
        });
      }
    });
    scrollMessagesToEnd(container);
  }

  if (history.length === 0) {
    const welcome = pickPack('greeting');
    history.push({
      role: 'assistant',
      text: welcome.paragraphs.join('\n\n'),
      paragraphs: welcome.paragraphs,
      cards: welcome.cards || [],
      ts: new Date().toISOString(),
    });
    persist();
  }

  renderHistoryFromStorage();
  document.getElementById('cp-assistant-skeleton')?.remove();

  let busy = false;

  async function sendFromUser(textRaw) {
    const text = textRaw.trim();
    if (!text || busy) return;

    busy = true;
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    const userTs = new Date().toISOString();
    history.push({ role: 'user', text, ts: userTs });
    persist();
    appendUserToDom(text, userTs);

    setThinking(container, true);
    scrollMessagesToEnd(container);

    await new Promise((r) => setTimeout(r, 450 + randomInt(0, 400)));

    const reply = await resolveAssistantReply(text);
    setThinking(container, false);

    const assistantTs = new Date().toISOString();
    history.push({
      role: 'assistant',
      text: reply.paragraphs.join('\n\n'),
      paragraphs: reply.paragraphs,
      cards: reply.cards,
      ts: assistantTs,
    });
    persist();

    appendAssistantToDom(reply.paragraphs, reply.cards, assistantTs, { animateTyping: true });

    busy = false;
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }

  function onSend() {
    const v = input.value;
    input.value = '';
    sendFromUser(v);
  }

  if (sendBtn) sendBtn.addEventListener('click', onSend);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  });

  container.querySelectorAll(sel.chip).forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt') || btn.textContent.trim();
      sendFromUser(prompt);
    });
  });

  wireWebSpeech({
    input,
    sendFromUser,
    voiceBtn: document.querySelector(sel.voice),
    statusEl: document.querySelector(sel.voiceStatus),
    autosendEl: document.querySelector(sel.voiceAutosend),
  });

  return {
    send: sendFromUser,
    clearHistory() {
      history = [];
      persist();
      const welcome = pickPack('greeting');
      history.push({
        role: 'assistant',
        paragraphs: welcome.paragraphs,
        text: welcome.paragraphs.join('\n\n'),
        cards: welcome.cards || [],
        ts: new Date().toISOString(),
      });
      persist();
      renderHistoryFromStorage();
    },
  };
}
