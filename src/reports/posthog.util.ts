// Note: This should be a PRIVATE API key from PostHog, not the public key used in frontend
// Get it from: PostHog Project Settings > Project API Keys > Private API Key
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://app.posthog.com';

// Try alternative API hosts if the main one doesn't work
const ALTERNATIVE_API_HOSTS = [
  'https://app.posthog.com',
  'https://api.posthog.com',
  'https://posthog.com',
  'https://eu.posthog.com', // EU region
];

// PostHog Project ID - this should match the one used in the frontend
// Use the environment variable value - no hardcoded fallback
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

// Validate that we have the project ID
if (!POSTHOG_PROJECT_ID) {
  console.error('❌ POSTHOG_PROJECT_ID environment variable is not set. YouTube click data will not be available in reports.');
} else if (POSTHOG_PROJECT_ID.length < 5) {
  console.warn(`⚠️  POSTHOG_PROJECT_ID appears to be too short: ${POSTHOG_PROJECT_ID} (length: ${POSTHOG_PROJECT_ID.length})`);
  console.warn(`⚠️  Expected length: 5+ characters, got: ${POSTHOG_PROJECT_ID.length}`);
}

console.log(`🔧 PostHog Project ID resolved:`, {
  envValue: process.env.POSTHOG_PROJECT_ID,
  envValueLength: process.env.POSTHOG_PROJECT_ID?.length || 0,
  finalValue: POSTHOG_PROJECT_ID || 'NOT_SET',
  finalValueLength: POSTHOG_PROJECT_ID?.length || 0,
  isUsingEnvVar: !!process.env.POSTHOG_PROJECT_ID
});

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

export async function fetchYouTubeClicks(
  eventType: 'click_youtube_live' | 'click_youtube_deferred',
  from: string,
  to: string,
  limit: number = 1000 // Increased default limit to get more data
): Promise<PostHogClickEvent[]> {
  if (!POSTHOG_API_KEY) {
    console.warn('⚠️  No PostHog API key configured, skipping YouTube click data');
    return [];
  }

  try {
    console.log(`🔍 Fetching YouTube clicks for ${eventType} from ${from} to ${to}`);
    
    // Try multiple endpoint formats to find the correct one
    // Based on PostHog API documentation: https://posthog.com/docs/api
    const endpoints = [
      // Primary: Events endpoint (GET request) - using the correct format
      {
        url: `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events/`,
        method: 'GET',
        params: `?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}`
      },
      // Alternative: Direct events endpoint without project ID
      {
        url: `${POSTHOG_API_HOST}/api/events/`,
        method: 'GET',
        params: `?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}`
      },
      // Fallback: Try with project ID in query params (but keep API key in header)
      {
        url: `${POSTHOG_API_HOST}/api/events/`,
        method: 'GET',
        params: `?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}&project_id=${POSTHOG_PROJECT_ID}`
      },
      // Alternative: Try the insights endpoint with different format
      {
        url: `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/insights/trend/`,
        method: 'POST',
        body: {
          events: [{
            id: eventType,
            type: 'events'
          }],
          date_from: from,
          date_to: to,
          limit: limit
        }
      },
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
    
    console.log(`🔍 Constructed endpoints:`, endpoints.map((endpoint, i) => `${i + 1}. ${endpoint.method} ${endpoint.url}${endpoint.params || ''}`));
    
    let lastError: Error | null = null;
    
    for (const endpoint of endpoints) {
      try {
        const fullUrl = endpoint.params ? `${endpoint.url}${endpoint.params}` : endpoint.url;
        console.log(`🔍 Trying PostHog endpoint: ${endpoint.method} ${fullUrl}`);
        
        const fetchOptions: RequestInit = {
          method: endpoint.method,
          headers: {
            Authorization: `Bearer ${POSTHOG_API_KEY}`,
            'Content-Type': 'application/json',
          },
        };
        
        console.log(`🔐 Authentication: Bearer ${POSTHOG_API_KEY.substring(0, 10)}...`);
        
        let finalUrl = endpoint.url;
        if (endpoint.params) {
          finalUrl = `${endpoint.url}${endpoint.params}`;
        }
        
        if (endpoint.body) {
          fetchOptions.body = JSON.stringify(endpoint.body);
        }
        
        const res = await fetch(finalUrl, fetchOptions);
        
        if (res.ok) {
          const data = await res.json();
          console.log(`📊 PostHog API response for ${eventType}:`, {
            status: res.status,
            dataKeys: Object.keys(data),
            resultsCount: data.results?.length || 0,
            totalCount: data.total_count || 'unknown',
            responseUrl: res.url,
            hasNext: !!data.next
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
            // Try to get the response body for better error information
            let errorBody = '';
            try {
              errorBody = await res.text();
            } catch (e) {
              errorBody = 'Could not read error response body';
            }
            
            console.warn(`⚠️  Endpoint ${fullUrl} returned ${res.status}: ${res.statusText}`);
            console.warn(`⚠️  Error response body:`, errorBody);
            
            lastError = new Error(`PostHog API error: ${res.status} ${res.statusText} - ${errorBody}`);
            continue; // Try next endpoint
          }
          
          // If we have a 'next' cursor, fetch additional pages to get all data
          if (data.next && events.length > 0) {
            console.log(`📄 Found pagination cursor, fetching additional pages...`);
            let allEvents = [...events];
            let nextCursor = data.next;
            let pageCount = 1;
            
            while (nextCursor && pageCount < 10) { // Limit to 10 pages to prevent infinite loops
              try {
                const nextUrl = `${endpoint.url}?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}&after_cursor=${nextCursor}`;
                console.log(`📄 Fetching page ${pageCount + 1} with cursor: ${nextCursor}`);
                
                const nextRes = await fetch(nextUrl, fetchOptions);
                if (nextRes.ok) {
                  const nextData = await nextRes.json();
                  if (nextData.results && Array.isArray(nextData.results)) {
                    allEvents = [...allEvents, ...nextData.results];
                    nextCursor = nextData.next;
                    pageCount++;
                    console.log(`📄 Page ${pageCount} added ${nextData.results.length} events. Total so far: ${allEvents.length}`);
                  } else {
                    break;
                  }
                } else {
                  console.warn(`⚠️  Failed to fetch page ${pageCount + 1}: ${nextRes.status}`);
                  break;
                }
              } catch (error) {
                console.warn(`⚠️  Error fetching page ${pageCount + 1}:`, error);
                break;
              }
            }
            
            events = allEvents;
            console.log(`📄 Pagination complete. Total events fetched: ${events.length} across ${pageCount} pages`);
          }
          
          console.log(`✅ Successfully fetched ${events.length} events for ${eventType} from ${fullUrl}`);
          
          // Log sample events for debugging
          if (events.length > 0) {
            console.log(`📝 Sample event:`, events[0]);
            console.log(`🔍 Event properties keys:`, Object.keys(events[0]?.properties || {}));
          }
          
          return events as PostHogClickEvent[];
        } else {
          // Try to get the response body for better error information
          let errorBody = '';
          try {
            errorBody = await res.text();
          } catch (e) {
            errorBody = 'Could not read error response body';
          }
          
          console.warn(`⚠️  Endpoint ${fullUrl} returned ${res.status}: ${res.statusText}`);
          console.warn(`⚠️  Error response body:`, errorBody);
          
          lastError = new Error(`PostHog API error: ${res.status} ${res.statusText} - ${errorBody}`);
          continue; // Try next endpoint
        }
      } catch (error) {
        console.warn(`⚠️  Endpoint ${endpoint.url} failed:`, error);
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
    
    // Test multiple API hosts and endpoints
    let lastError: Error | null = null;
    
    for (const apiHost of ALTERNATIVE_API_HOSTS) {
      console.log(`🔍 Testing API host: ${apiHost}`);
      
      const testEndpoints = [
        // Test basic connectivity first
        {
          url: `${apiHost}/api/events/`,
          method: 'GET',
          description: 'Basic events endpoint',
          params: `?limit=1`
        },
        // Test with project ID in query params (API key stays in header)
        {
          url: `${apiHost}/api/events/`,
          method: 'GET',
          description: 'Events endpoint with project ID in query params',
          params: `?project_id=${POSTHOG_PROJECT_ID}&limit=1`
        },
        // Test project-specific events endpoint
        {
          url: `${apiHost}/api/projects/${POSTHOG_PROJECT_ID}/events/`,
          method: 'GET',
          description: 'Project-specific events endpoint',
          params: `?limit=1`
        },
        // Test user info endpoint
        {
          url: `${apiHost}/api/users/@me/`,
          method: 'GET',
          description: 'User info endpoint (API key validation)'
        },
      ];
      
      for (const endpoint of testEndpoints) {
        try {
          console.log(`🔍 Testing endpoint: ${endpoint.method} ${endpoint.url} (${endpoint.description})`);
          
          const fetchOptions: RequestInit = {
            method: endpoint.method,
            headers: {
              Authorization: `Bearer ${POSTHOG_API_KEY}`,
              'Content-Type': 'application/json',
            },
          };
          
          console.log(`🔐 Authentication: Bearer ${POSTHOG_API_KEY.substring(0, 10)}...`);
          
          let finalUrl = endpoint.url;
          if (endpoint.params) {
            finalUrl = `${endpoint.url}${endpoint.params}`;
          }
          
          const res = await fetch(finalUrl, fetchOptions);
          
          if (res.ok) {
            const data = await res.json();
            console.log(`✅ PostHog connection successful with API host: ${apiHost}`);
            console.log(`✅ Working endpoint: ${endpoint.url} (${endpoint.description})`);
            console.log(`📊 Response keys:`, Object.keys(data));
            
            return {
              success: true,
              message: `PostHog connection successful with API host: ${apiHost} and endpoint: ${endpoint.url}`,
              details: { 
                workingApiHost: apiHost,
                workingEndpoint: endpoint.url,
                workingMethod: endpoint.method,
                description: endpoint.description,
                status: res.status, 
                responseKeys: Object.keys(data),
                hasResults: !!data.results,
                resultsCount: data.results?.length || 0
              }
            };
          } else {
            // Try to get the response body for better error information
            let errorBody = '';
            try {
              errorBody = await res.text();
            } catch (e) {
              errorBody = 'Could not read error response body';
            }
            
            console.warn(`⚠️  Endpoint ${endpoint.url} on ${apiHost} returned ${res.status}: ${res.statusText}`);
            console.warn(`⚠️  Error response body:`, errorBody);
            
            lastError = new Error(`HTTP ${res.status}: ${res.statusText} - ${errorBody}`);
            continue;
          }
        } catch (error) {
          console.warn(`⚠️  Endpoint ${endpoint.url} on ${apiHost} failed:`, error);
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }
      }
      
      // If we get here, all endpoints failed for this API host
      console.warn(`⚠️  All endpoints failed for API host: ${apiHost}`);
    }
    
    // If we get here, all API hosts and endpoints failed
    return {
      success: false,
      message: `All PostHog API hosts and endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`,
      details: { 
        testedApiHosts: ALTERNATIVE_API_HOSTS,
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
    finalProjectId: string;
    finalProjectIdLength: number;
    isUsingEnvVar: boolean;
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
  } else if (POSTHOG_PROJECT_ID.length < 5) {
    issues.push(`POSTHOG_PROJECT_ID appears to be too short: ${POSTHOG_PROJECT_ID} (length: ${POSTHOG_PROJECT_ID.length})`);
    issues.push('Expected length: 5+ characters');
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
      finalProjectId: POSTHOG_PROJECT_ID || 'NOT_SET',
      finalProjectIdLength: POSTHOG_PROJECT_ID?.length || 0,
      isUsingEnvVar: !!process.env.POSTHOG_PROJECT_ID
    }
  };
} 