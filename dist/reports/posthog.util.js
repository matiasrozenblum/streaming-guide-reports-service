"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchYouTubeClicks = fetchYouTubeClicks;
exports.aggregateClicksBy = aggregateClicksBy;
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://app.posthog.com';
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
async function fetchYouTubeClicks(eventType, from, to, limit = 1000) {
    if (!POSTHOG_API_KEY) {
        return [];
    }
    const endpoints = [
        {
            url: `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events/`,
            method: 'GET',
            params: `?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}`,
        },
        {
            url: `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
            method: 'POST',
            body: {
                query: {
                    kind: 'EventsQuery',
                    select: ['*'],
                    event: [eventType],
                    after: `${from}T00:00:00Z`,
                    before: `${to}T23:59:59Z`,
                    limit: limit,
                },
            },
        },
        {
            url: `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/insights/trend/`,
            method: 'GET',
            params: `?events=[{"id":"${eventType}","type":"events"}]&date_from=${from}&date_to=${to}&limit=${limit}`,
        },
        {
            url: `${POSTHOG_API_HOST}/api/events/`,
            method: 'GET',
            params: `?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}`,
        },
    ];
    let lastError = null;
    for (const endpoint of endpoints) {
        try {
            const fullUrl = endpoint.params ? `${endpoint.url}${endpoint.params}` : endpoint.url;
            const fetchOptions = {
                method: endpoint.method,
                headers: {
                    Authorization: `Bearer ${POSTHOG_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            };
            if (endpoint.body) {
                fetchOptions.body = JSON.stringify(endpoint.body);
            }
            const res = await fetch(fullUrl, fetchOptions);
            if (res.ok) {
                const data = await res.json();
                let events = [];
                if (data.results && Array.isArray(data.results)) {
                    events = data.results;
                }
                else if (data.events && Array.isArray(data.events)) {
                    events = data.events;
                }
                else if (data.data && Array.isArray(data.data)) {
                    events = data.data;
                }
                else if (Array.isArray(data)) {
                    events = data;
                }
                if (data.next && events.length > 0) {
                    let allEvents = [...events];
                    let nextCursor = data.next;
                    let pageCount = 1;
                    while (nextCursor && pageCount < 10) {
                        try {
                            const nextUrl = `${endpoint.url}?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}&after_cursor=${nextCursor}`;
                            const nextRes = await fetch(nextUrl, fetchOptions);
                            if (nextRes.ok) {
                                const nextData = await nextRes.json();
                                if (nextData.results && Array.isArray(nextData.results)) {
                                    allEvents = [...allEvents, ...nextData.results];
                                    nextCursor = nextData.next;
                                    pageCount++;
                                }
                                else {
                                    break;
                                }
                            }
                            else {
                                break;
                            }
                        }
                        catch (error) {
                            break;
                        }
                    }
                    events = allEvents;
                }
                return events;
            }
            else {
                const errorBody = await res.text();
                lastError = new Error(`HTTP ${res.status}: ${res.statusText} - ${errorBody}`);
            }
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }
    throw lastError || new Error('All PostHog API endpoints failed');
}
async function aggregateClicksBy(events, property) {
    const aggregated = {};
    for (const event of events) {
        const value = event.properties?.[property];
        if (value) {
            aggregated[value] = (aggregated[value] || 0) + 1;
        }
    }
    return aggregated;
}
//# sourceMappingURL=posthog.util.js.map