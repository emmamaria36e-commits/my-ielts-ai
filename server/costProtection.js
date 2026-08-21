'use strict';

const {
  MAX_CONCURRENCY,
  MAX_DAILY_LIMIT,
  parseIntegerConfig,
} = require('./runtimeConfig');

const DEFAULT_LIMITS = {
  aiPerInviteDaily: 15,
  speechPerInviteDaily: 20,
  aiGlobalDaily: 100,
  speechGlobalDaily: 150,
  aiGlobalConcurrency: 3,
  speechGlobalConcurrency: 3,
};

function parseEnabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function readCostProtectionConfig(env = process.env) {
  return {
    ai: {
      enabled: parseEnabled(env.AI_ENABLED),
      perInviteDailyLimit: parseIntegerConfig(env.AI_GENERATE_DAILY_LIMIT, {
        fallback: DEFAULT_LIMITS.aiPerInviteDaily,
        max: MAX_DAILY_LIMIT,
      }),
      globalDailyLimit: parseIntegerConfig(env.GLOBAL_AI_DAILY_LIMIT, {
        fallback: DEFAULT_LIMITS.aiGlobalDaily,
        max: MAX_DAILY_LIMIT,
      }),
      globalConcurrency: parseIntegerConfig(env.GLOBAL_AI_CONCURRENCY, {
        fallback: DEFAULT_LIMITS.aiGlobalConcurrency,
        max: MAX_CONCURRENCY,
      }),
    },
    speech: {
      enabled: parseEnabled(env.SPEECH_ENABLED),
      perInviteDailyLimit: parseIntegerConfig(env.SPEECH_DAILY_LIMIT, {
        fallback: DEFAULT_LIMITS.speechPerInviteDaily,
        max: MAX_DAILY_LIMIT,
      }),
      globalDailyLimit: parseIntegerConfig(env.GLOBAL_SPEECH_DAILY_LIMIT, {
        fallback: DEFAULT_LIMITS.speechGlobalDaily,
        max: MAX_DAILY_LIMIT,
      }),
      globalConcurrency: parseIntegerConfig(env.GLOBAL_SPEECH_CONCURRENCY, {
        fallback: DEFAULT_LIMITS.speechGlobalConcurrency,
        max: MAX_CONCURRENCY,
      }),
    },
  };
}

function formatServerDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createKindState() {
  return {
    dailyByInvite: new Map(),
    globalDaily: 0,
    activeInvites: new Set(),
    globalActive: 0,
  };
}

function createCostProtection(config, options = {}) {
  const now = options.now || (() => new Date());
  const state = {
    day: formatServerDay(now()),
    ai: createKindState(),
    speech: createKindState(),
  };

  function resetIfNeeded() {
    const currentDay = formatServerDay(now());
    if (currentDay === state.day) return;
    state.day = currentDay;
    state.ai.dailyByInvite.clear();
    state.ai.globalDaily = 0;
    state.speech.dailyByInvite.clear();
    state.speech.globalDaily = 0;
  }

  function acquire(kind, inviteId) {
    const policy = config[kind];
    const kindState = state[kind];
    if (!policy || !kindState) throw new Error('Unsupported cost protection kind.');

    if (!policy.enabled) {
      return { ok: false, status: 503, reason: 'disabled' };
    }

    resetIfNeeded();
    const inviteDaily = kindState.dailyByInvite.get(inviteId) || 0;
    if (inviteDaily >= policy.perInviteDailyLimit
        || kindState.globalDaily >= policy.globalDailyLimit) {
      return { ok: false, status: 429, reason: 'daily-limit' };
    }

    if (kindState.activeInvites.has(inviteId)) {
      return { ok: false, status: 429, reason: 'invite-concurrency' };
    }

    kindState.activeInvites.add(inviteId);
    if (kindState.globalActive >= policy.globalConcurrency) {
      kindState.activeInvites.delete(inviteId);
      return { ok: false, status: 429, reason: 'global-concurrency' };
    }

    kindState.globalActive += 1;
    kindState.dailyByInvite.set(inviteId, inviteDaily + 1);
    kindState.globalDaily += 1;

    let released = false;
    return {
      ok: true,
      release() {
        if (released) return;
        released = true;
        kindState.activeInvites.delete(inviteId);
        kindState.globalActive = Math.max(0, kindState.globalActive - 1);
      },
    };
  }

  function inspect(kind, inviteId) {
    resetIfNeeded();
    const kindState = state[kind];
    return {
      day: state.day,
      inviteDaily: kindState.dailyByInvite.get(inviteId) || 0,
      globalDaily: kindState.globalDaily,
      inviteActive: kindState.activeInvites.has(inviteId),
      globalActive: kindState.globalActive,
    };
  }

  return { acquire, inspect };
}

module.exports = {
  createCostProtection,
  formatServerDay,
  parseEnabled,
  readCostProtectionConfig,
};
