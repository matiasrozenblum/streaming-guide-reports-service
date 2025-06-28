"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchYouTubeClicks = fetchYouTubeClicks;
exports.aggregateClicksBy = aggregateClicksBy;
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://app.posthog.com';
if (!POSTHOG_API_KEY) {
    console.warn('⚠️  POSTHOG_API_KEY environment variable is not set. YouTube click data will not be available in reports.');
}
async function fetchYouTubeClicks({ from, to, eventType, breakdownBy = 'channel_name', limit = 10000, }) {
    if (!POSTHOG_API_KEY) {
        console.warn(`⚠️  Skipping PostHog API call for ${eventType} - no API key configured`);
        return [];
    }
    try {
        const url = `${POSTHOG_API_HOST}/api/projects/@current/events?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}`;
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${POSTHOG_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) {
            if (res.status === 401) {
                throw new Error(`PostHog API error: 401 Unauthorized - Please check your POSTHOG_API_KEY environment variable. Make sure you're using a PRIVATE API key, not the public key.`);
            }
            throw new Error(`PostHog API error: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        return data.results;
    }
    catch (error) {
        console.error(`❌ Error fetching PostHog data for ${eventType}:`, error);
        return [];
    }
}
async function aggregateClicksBy(events, groupBy) {
    const counts = {};
    for (const ev of events) {
        const key = ev.properties[groupBy] || 'unknown';
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}
//# sourceMappingURL=posthog.util.js.map