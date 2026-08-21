'use strict';

const MAX_DAILY_LIMIT = 10_000;
const MAX_CONCURRENCY = 100;
const MAX_TRUST_PROXY_HOPS = 10;

function parseIntegerConfig(value, options) {
  const { fallback, min = 1, max } = options;
  if (value === undefined || value === null || String(value).trim() === '') return fallback;

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return fallback;

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function parseTrustProxyHops(value) {
  return parseIntegerConfig(value, {
    fallback: 0,
    min: 0,
    max: MAX_TRUST_PROXY_HOPS,
  });
}

module.exports = {
  MAX_CONCURRENCY,
  MAX_DAILY_LIMIT,
  MAX_TRUST_PROXY_HOPS,
  parseIntegerConfig,
  parseTrustProxyHops,
};
