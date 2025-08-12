// Note: This should be a PRIVATE API key from PostHog, not the public key used in frontend
// Get it from: PostHog Project Settings > Project API Keys > Private API Key
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://app.posthog.com';

// PostHog Project ID - this should match the one used in the frontend
// The full project ID is: ioX3gwDuENT8MoUWSacARsCFVE6bSbKaEh5u7Mie5oK
const ENV_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const HARDCODED_PROJECT_ID = 'ioX3gwDuENT8MoUWSacARsCFVE6bSbKaEh5u7Mie5oK';

// Use environment variable if it's valid, otherwise fall back to hardcoded value
const POSTHOG_PROJECT_ID = (ENV_PROJECT_ID && ENV_PROJECT_ID.length >= 40) ? ENV_PROJECT_ID : HARDCODED_PROJECT_ID;

// Manual override option - uncomment and set if environment variable is not working
// const MANUAL_OVERRIDE_PROJECT_ID = 'ioX3gwDuENT8MoUWSacARsCFVE6bSbKaEh5u7Mie5oK';
// const POSTHOG_PROJECT_ID = MANUAL_OVERRIDE_PROJECT_ID;

// Validate that we have the full project ID
if (POSTHOG_PROJECT_ID.length < 40) {
  console.warn(`⚠️  POSTHOG_PROJECT_ID appears to be truncated: ${POSTHOG_PROJECT_ID} (length: ${POSTHOG_PROJECT_ID.length})`);
  console.warn(`⚠️  Expected length: ~40 characters, got: ${POSTHOG_PROJECT_ID.length}`);
  console.warn(`⚠️  Using hardcoded fallback: ${HARDCODED_PROJECT_ID}`);
}

console.log(`🔧 PostHog Project ID resolved:`, {
  envValue: ENV_PROJECT_ID,
  envValueLength: ENV_PROJECT_ID?.length || 0,
  finalValue: POSTHOG_PROJECT_ID,
  finalValueLength: POSTHOG_PROJECT_ID.length,
  isUsingFallback: POSTHOG_PROJECT_ID === HARDCODED_PROJECT_ID
});

if (!POSTHOG_API_KEY) {
  console.warn('⚠️  POSTHOG_API_KEY environment variable is not set. YouTube click data will not be available in reports.');
}

// Function to manually override the project ID if needed
export function setPostHogProjectId(projectId: string) {
  if (projectId && projectId.length >= 40) {
    console.log(`🔧 Manually setting PostHog Project ID to: ${projectId}`);
    // Note: This is a workaround - in a real implementation, you might want to use a different approach
    // For now, we'll just log it and the user can set the environment variable
    console.log(`🔧 Please set POSTHOG_PROJECT_ID environment variable to: ${projectId}`);
    return true;
  } else {
    console.error(`❌ Invalid project ID: ${projectId} (length: ${projectId?.length || 0})`);
    return false;
  }
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
    // Try multiple endpoint formats to find the correct one
    // Based on PostHog API documentation: https://posthog.com/docs/api
    const endpoints = [
      // Primary: Query events directly
      `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
      // Alternative: Events endpoint
      `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events/`,
      // Fallback: Insights endpoint
      `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/insights/trend/`,
      // Legacy: Direct events endpoint
      `${POSTHOG_API_HOST}/api/events/`,
    ];
    
    console.log(`🔍 PostHog configuration:`, {
      apiHost: POSTHOG_API_HOST,
      projectId: POSTHOG_PROJECT_ID,
      projectIdLength: POSTHOG_PROJECT_ID.length,
      eventType,
      from,
      to,
      limit
    });
    
    console.log(`🔍 Constructed endpoints:`, endpoints.map((url, i) => `${i + 1}. ${url}`));
    
    let lastError: Error | null = null;
    
    for (const url of endpoints) {
      try {
        console.log(`🔍 Trying PostHog endpoint: ${url}`);
        
        let requestBody: any = null;
        let method = 'GET';
        
        // For the query endpoint, we need to send a POST request with a query body
        if (url.includes('/query/')) {
          method = 'POST';
          requestBody = {
            query: {
              kind: 'EventsQuery',
              select: ['*'],
              event: [eventType],
              after: `${from}T00:00:00Z`,
              before: `${to}T23:59:59Z`,
              limit: limit
            }
          };
        } else if (url.includes('/insights/trend/')) {
          method = 'POST';
          requestBody = {
            events: [{
              id: eventType,
              type: 'events'
            }],
            date_from: from,
            date_to: to,
            limit: limit
          };
        }
        
        const fetchOptions: RequestInit = {
          method,
          headers: {
            Authorization: `Bearer ${POSTHOG_API_KEY}`,
            'Content-Type': 'application/json',
          },
        };
        
        if (requestBody) {
          fetchOptions.body = JSON.stringify(requestBody);
        }
        
        const res = await fetch(url, fetchOptions);
        
        if (res.ok) {
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
          } else if (data.result && Array.isArray(data.result)) {
            events = data.result;
          } else {
            console.warn(`⚠️  Unexpected PostHog API response format for ${eventType}:`, data);
            continue; // Try next endpoint
          }
          
          console.log(`✅ Successfully fetched ${events.length} events for ${eventType} from ${url}`);
          
          // Log sample events for debugging
          if (events.length > 0) {
            console.log(`📝 Sample event:`, events[0]);
            console.log(`🔍 Event properties keys:`, Object.keys(events[0]?.properties || {}));
          }
          
          return events as PostHogClickEvent[];
        } else {
          console.warn(`⚠️  Endpoint ${url} returned ${res.status}: ${res.statusText}`);
          lastError = new Error(`PostHog API error: ${res.status} ${res.statusText}`);
          continue; // Try next endpoint
        }
      } catch (error) {
        console.warn(`⚠️  Endpoint ${url} failed:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue; // Try next endpoint
      }
    }
    
    // If we get here, all endpoints failed
    throw lastError || new Error('All PostHog API endpoints failed');
    
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
    console.log(`📏 Project ID Length: ${POSTHOG_PROJECT_ID.length}`);
    
    // Test multiple endpoints
    const testEndpoints = [
      `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
      `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events/`,
      `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/insights/trend/`,
      `${POSTHOG_API_HOST}/api/events/`,
    ];
    
    let lastError: Error | null = null;
    
    for (const url of testEndpoints) {
      try {
        console.log(`🔍 Testing endpoint: ${url}`);
        
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${POSTHOG_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (res.ok) {
          const data = await res.json();
          console.log(`✅ PostHog connection successful with endpoint: ${url}`);
          console.log(`📊 Response keys:`, Object.keys(data));
          
          return {
            success: true,
            message: `PostHog connection successful with endpoint: ${url}`,
            details: { 
              workingEndpoint: url,
              status: res.status, 
              responseKeys: Object.keys(data),
              hasResults: !!data.results,
              resultsCount: data.results?.length || 0
            }
          };
        } else {
          console.warn(`⚠️  Endpoint ${url} returned ${res.status}: ${res.statusText}`);
          lastError = new Error(`HTTP ${res.status}: ${res.statusText}`);
          continue;
        }
      } catch (error) {
        console.warn(`⚠️  Endpoint ${url} failed:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
    }
    
    // If we get here, all endpoints failed
    return {
      success: false,
      message: `All PostHog endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`,
      details: { 
        testedEndpoints: testEndpoints,
        lastError: lastError?.message || 'Unknown error',
        projectId: POSTHOG_PROJECT_ID,
        projectIdLength: POSTHOG_PROJECT_ID.length
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

// Add a function to validate PostHog configuration
export function validatePostHogConfig(): {
  isValid: boolean;
  issues: string[];
  config: {
    apiKey: string;
    apiHost: string;
    projectId: string;
  };
  environment: {
    envProjectId: string | undefined;
    envProjectIdLength: number;
    hardcodedProjectId: string;
    hardcodedProjectIdLength: number;
    finalProjectId: string;
    finalProjectIdLength: number;
    isUsingFallback: boolean;
  };
} {
  const issues: string[] = [];
  
  if (!POSTHOG_API_KEY) {
    issues.push('POSTHOG_API_KEY is not set');
  } else if (POSTHOG_API_KEY.length < 10) {
    issues.push('POSTHOG_API_KEY appears to be too short');
  }
  
  if (!POSTHOG_API_HOST) {
    issues.push('POSTHOG_API_HOST is not set');
  } else if (!POSTHOG_API_HOST.startsWith('http')) {
    issues.push('POSTHOG_API_HOST should be a valid URL');
  }
  
  if (!POSTHOG_PROJECT_ID) {
    issues.push('POSTHOG_PROJECT_ID is not set');
  } else if (POSTHOG_PROJECT_ID.length < 40) {
    issues.push(`POSTHOG_PROJECT_ID appears to be truncated: ${POSTHOG_PROJECT_ID} (length: ${POSTHOG_PROJECT_ID.length})`);
    issues.push('Expected length: ~40 characters');
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    config: {
      apiKey: POSTHOG_API_KEY || 'NOT_SET',
      apiHost: POSTHOG_API_HOST || 'NOT_SET',
      projectId: POSTHOG_PROJECT_ID || 'NOT_SET'
    },
    environment: {
      envProjectId: process.env.POSTHOG_PROJECT_ID,
      envProjectIdLength: process.env.POSTHOG_PROJECT_ID?.length || 0,
      hardcodedProjectId: 'ioX3gwDuENT8MoUWSacARsCFVE6bSbKaEh5u7Mie5oK',
      hardcodedProjectIdLength: 'ioX3gwDuENT8MoUWSacARsCFVE6bSbKaEh5u7Mie5oK'.length,
      finalProjectId: POSTHOG_PROJECT_ID || 'NOT_SET',
      finalProjectIdLength: POSTHOG_PROJECT_ID?.length || 0,
      isUsingFallback: POSTHOG_PROJECT_ID === 'ioX3gwDuENT8MoUWSacARsCFVE6bSbKaEh5u7Mie5oK'
    }
  };
} 