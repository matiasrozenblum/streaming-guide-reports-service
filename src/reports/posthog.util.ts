// Note: This should be a PRIVATE API key from PostHog, not the public key used in frontend
// Get it from: PostHog Project Settings > Project API Keys > Private API Key
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://app.posthog.com';
// PostHog Project ID - this should match the one used in the frontend
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID || 'ioX3gwDuENT8MoUWSacARsCFVE6bSbKaEh5u7Mie5oK';

if (!POSTHOG_API_KEY) {
  console.warn('⚠️  POSTHOG_API_KEY environment variable is not set. YouTube click data will not be available in reports.');
}

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

export async function fetchYouTubeClicks({
  from,
  to,
  eventType,
  breakdownBy = 'channel_name',
  limit = 10000,
}: {
  from: string;
  to: string;
  eventType: 'click_youtube_live' | 'click_youtube_deferred';
  breakdownBy?: 'channel_name' | 'program_name';
  limit?: number;
}): Promise<PostHogClickEvent[]> {
  if (!POSTHOG_API_KEY) {
    console.warn(`⚠️  Skipping PostHog API call for ${eventType} - no API key configured`);
    return [];
  }

  try {
    // PostHog API: Use the correct endpoint for querying events with project ID
    // The previous endpoint was incorrect - using the proper project-specific events endpoint
    const url = `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events/?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}`;
    
    console.log(`🔍 Fetching PostHog data from: ${url}`);
    console.log(`📅 Date range: ${from}T00:00:00Z to ${to}T23:59:59Z`);
    console.log(`🎯 Event type: ${eventType}`);
    
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
    console.log(`📊 PostHog API response for ${eventType}:`, {
      status: res.status,
      dataKeys: Object.keys(data),
      resultsCount: data.results?.length || 0,
      totalCount: data.total_count || 'unknown',
      responseUrl: res.url
    });
    
    // Handle different possible response formats
    let events: PostHogClickEvent[] = [];
    if (data.results && Array.isArray(data.results)) {
      events = data.results;
    } else if (data.events && Array.isArray(data.events)) {
      events = data.events;
    } else if (Array.isArray(data)) {
      events = data;
    } else {
      console.warn(`⚠️  Unexpected PostHog API response format for ${eventType}:`, data);
      
      // Try alternative endpoint as fallback
      console.log(`🔄 Trying alternative PostHog API endpoint...`);
      const fallbackUrl = `${POSTHOG_API_HOST}/api/events/?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}`;
      console.log(`🔍 Fallback URL: ${fallbackUrl}`);
      
      const fallbackRes = await fetch(fallbackUrl, {
        headers: {
          Authorization: `Bearer ${POSTHOG_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        console.log(`📊 Fallback API response:`, {
          status: fallbackRes.status,
          dataKeys: Object.keys(fallbackData),
          resultsCount: fallbackData.results?.length || 0
        });
        
        if (fallbackData.results && Array.isArray(fallbackData.results)) {
          events = fallbackData.results;
        } else if (fallbackData.events && Array.isArray(fallbackData.events)) {
          events = fallbackData.events;
        } else if (Array.isArray(fallbackData)) {
          events = fallbackData;
        }
      } else {
        console.warn(`⚠️  Fallback API also failed: ${fallbackRes.status} ${fallbackRes.statusText}`);
      }
    }
    
    console.log(`✅ Successfully fetched ${events.length} events for ${eventType}`);
    
    // Log sample events for debugging
    if (events.length > 0) {
      console.log(`📝 Sample event:`, events[0]);
      console.log(`🔍 Event properties keys:`, Object.keys(events[0]?.properties || {}));
    }
    
    return events as PostHogClickEvent[];
  } catch (error) {
    console.error(`❌ Error fetching PostHog data for ${eventType}:`, error);
    // Return empty array instead of throwing to prevent report generation from failing
    return [];
  }
}

export async function aggregateClicksBy(
  events: PostHogClickEvent[],
  groupBy: 'channel_name' | 'program_name',
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const ev of events) {
    const key = ev.properties[groupBy] || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
} 

export async function testPostHogConnection(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  if (!POSTHOG_API_KEY) {
    return {
      success: false,
      message: 'POSTHOG_API_KEY not configured'
    };
  }

  try {
    console.log(`🧪 Testing PostHog connection...`);
    console.log(`🔑 API Key: ${POSTHOG_API_KEY.substring(0, 10)}...`);
    console.log(`🌐 API Host: ${POSTHOG_API_HOST}`);
    console.log(`📁 Project ID: ${POSTHOG_PROJECT_ID}`);
    
    // Test the main endpoint
    const testUrl = `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events/?limit=1`;
    console.log(`🔍 Testing URL: ${testUrl}`);
    
    const res = await fetch(testUrl, {
      headers: {
        Authorization: `Bearer ${POSTHOG_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!res.ok) {
      return {
        success: false,
        message: `HTTP ${res.status}: ${res.statusText}`,
        details: { url: testUrl, status: res.status, statusText: res.statusText }
      };
    }
    
    const data = await res.json();
    console.log(`✅ PostHog connection successful!`);
    console.log(`📊 Response keys:`, Object.keys(data));
    
    return {
      success: true,
      message: 'PostHog connection successful',
      details: { 
        url: testUrl, 
        status: res.status, 
        responseKeys: Object.keys(data),
        hasResults: !!data.results,
        resultsCount: data.results?.length || 0
      }
    };
  } catch (error) {
    console.error(`❌ PostHog connection test failed:`, error);
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: error instanceof Error ? error.message : String(error) }
    };
  }
} 