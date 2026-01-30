export type PostHogClickEvent = {
  event: string;
  properties: {
    channel_name?: string;
    program_name?: string;
    user_gender?: string;
    user_age?: number;
    user_id?: string;
    [key: string]: any;
  };
  timestamp: string;
};

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://app.posthog.com';
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

// Argentina is UTC-3, so we need to adjust the query times
// Start of day in Argentina (00:00) = 03:00 UTC same day
// End of day in Argentina (23:59:59) = 02:59:59 UTC next day
function getArgentinaDateRange(from: string, to: string): { utcFrom: string; utcTo: string } {
  // Parse the dates and add the UTC offset for Argentina (UTC-3)
  const fromDate = new Date(`${from}T03:00:00Z`); // 00:00 Argentina = 03:00 UTC
  const toDate = new Date(`${to}T23:59:59-03:00`); // 23:59:59 Argentina = next day 02:59:59 UTC

  return {
    utcFrom: fromDate.toISOString(),
    utcTo: toDate.toISOString(),
  };
}

export async function fetchYouTubeClicks(
  eventType: 'click_youtube_live' | 'click_youtube_deferred',
  from: string,
  to: string,
  limit: number = 1000
): Promise<PostHogClickEvent[]> {
  if (!POSTHOG_API_KEY) {
    return [];
  }

  const { utcFrom, utcTo } = getArgentinaDateRange(from, to);

  const endpoints = [
    {
      url: `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events/`,
      method: 'GET',
      params: `?event=${eventType}&after=${utcFrom}&before=${utcTo}&limit=${limit}`,
    },
    {
      url: `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
      method: 'POST',
      body: {
        query: {
          kind: 'EventsQuery',
          select: ['*'],
          event: [eventType],
          after: utcFrom,
          before: utcTo,
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
      params: `?event=${eventType}&after=${utcFrom}&before=${utcTo}&limit=${limit}`,
    },
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const fullUrl = endpoint.params ? `${endpoint.url}${endpoint.params}` : endpoint.url;

      const fetchOptions: RequestInit = {
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

        let events: PostHogClickEvent[] = [];

        if (data.results && Array.isArray(data.results)) {
          events = data.results;
        } else if (data.events && Array.isArray(data.events)) {
          events = data.events;
        } else if (data.data && Array.isArray(data.data)) {
          events = data.data;
        } else if (Array.isArray(data)) {
          events = data;
        }

        // If we have a 'next' cursor, fetch additional pages to get all data
        if (data.next && events.length > 0) {
          let allEvents = [...events];
          let nextCursor = data.next;
          let pageCount = 1;

          while (nextCursor && pageCount < 10) {
            try {
              const nextUrl = `${endpoint.url}?event=${eventType}&after=${utcFrom}&before=${utcTo}&limit=${limit}&after_cursor=${nextCursor}`;

              const nextRes = await fetch(nextUrl, fetchOptions);
              if (nextRes.ok) {
                const nextData = await nextRes.json();
                if (nextData.results && Array.isArray(nextData.results)) {
                  allEvents = [...allEvents, ...nextData.results];
                  nextCursor = nextData.next;
                  pageCount++;
                } else {
                  break;
                }
              } else {
                break;
              }
            } catch (error) {
              break;
            }
          }

          events = allEvents;
        }

        return events as PostHogClickEvent[];
      } else {
        const errorBody = await res.text();
        lastError = new Error(`HTTP ${res.status}: ${res.statusText} - ${errorBody}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('All PostHog API endpoints failed');
}

export async function aggregateClicksBy(
  events: PostHogClickEvent[],
  property: string
): Promise<Record<string, number>> {
  const aggregated: Record<string, number> = {};

  for (const event of events) {
    const value = event.properties?.[property];
    if (value) {
      aggregated[value] = (aggregated[value] || 0) + 1;
    }
  }

  return aggregated;
}

export async function fetchStreamerClicks(
  eventType: 'click_streamer_live' | 'click_streamer_offline',
  from: string,
  to: string,
  limit: number = 1000
): Promise<PostHogClickEvent[]> {
  if (!POSTHOG_API_KEY) {
    return [];
  }

  const { utcFrom, utcTo } = getArgentinaDateRange(from, to);

  const endpoints = [
    {
      url: `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events/`,
      method: 'GET',
      params: `?event=${eventType}&after=${utcFrom}&before=${utcTo}&limit=${limit}`,
    },
    {
      url: `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
      method: 'POST',
      body: {
        query: {
          kind: 'EventsQuery',
          select: ['*'],
          event: [eventType],
          after: utcFrom,
          before: utcTo,
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
      params: `?event=${eventType}&after=${utcFrom}&before=${utcTo}&limit=${limit}`,
    },
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const fullUrl = endpoint.params ? `${endpoint.url}${endpoint.params}` : endpoint.url;

      const fetchOptions: RequestInit = {
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

        let events: PostHogClickEvent[] = [];

        if (data.results && Array.isArray(data.results)) {
          events = data.results;
        } else if (data.events && Array.isArray(data.events)) {
          events = data.events;
        } else if (data.data && Array.isArray(data.data)) {
          events = data.data;
        } else if (Array.isArray(data)) {
          events = data;
        }

        // If we have a 'next' cursor, fetch additional pages to get all data
        if (data.next && events.length > 0) {
          let allEvents = [...events];
          let nextCursor = data.next;
          let pageCount = 1;

          while (nextCursor && pageCount < 10) {
            try {
              const nextUrl = `${endpoint.url}?event=${eventType}&after=${utcFrom}&before=${utcTo}&limit=${limit}&after_cursor=${nextCursor}`;

              const nextRes = await fetch(nextUrl, fetchOptions);
              if (nextRes.ok) {
                const nextData = await nextRes.json();
                if (nextData.results && Array.isArray(nextData.results)) {
                  allEvents = [...allEvents, ...nextData.results];
                  nextCursor = nextData.next;
                  pageCount++;
                } else {
                  break;
                }
              } else {
                break;
              }
            } catch (error) {
              break;
            }
          }

          events = allEvents;
        }

        return events as PostHogClickEvent[];
      } else {
        const errorBody = await res.text();
        lastError = new Error(`HTTP ${res.status}: ${res.statusText} - ${errorBody}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  return []; // Return empty array instead of throwing to not break the report
} 