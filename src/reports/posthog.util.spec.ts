// Set environment variable before importing the module
process.env.POSTHOG_API_KEY = 'dummy';

require('dotenv').config();
import { fetchYouTubeClicks, aggregateClicksBy } from './posthog.util';

describe('posthog.util', () => {
  let originalFetch: any;

  beforeEach(() => {
    // Clear any existing mocks
    jest.clearAllMocks();
    // Store original fetch
    originalFetch = global.fetch;
    // Ensure API key is set
    process.env.POSTHOG_API_KEY = 'dummy';
  });

  afterEach(() => {
    // Clean up environment variable
    delete process.env.POSTHOG_API_KEY;
    // Restore original fetch
    global.fetch = originalFetch;
  });

  it('should aggregate clicks by property', async () => {
    const events = [
      { event: 'click_youtube_live', properties: { channel_name: 'A' }, timestamp: '2024-01-01T00:00:00Z' },
      { event: 'click_youtube_live', properties: { channel_name: 'A' }, timestamp: '2024-01-01T00:00:00Z' },
      { event: 'click_youtube_live', properties: { channel_name: 'B' }, timestamp: '2024-01-01T00:00:00Z' },
    ];
    const result = await aggregateClicksBy(events, 'channel_name');
    expect(result.A).toBe(2);
    expect(result.B).toBe(1);
  });

  it('should fetchYouTubeClicks (mocked)', async () => {
    // Mock fetch to return expected data
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ 
        results: [
          { 
            event: 'click_youtube_live', 
            properties: { channel_name: 'A' }, 
            timestamp: '2024-01-01T00:00:00Z' 
          }
        ] 
      }),
    });
    
    // Replace global fetch with mock
    global.fetch = mockFetch;

    const result = await fetchYouTubeClicks({ 
      from: '2024-01-01', 
      to: '2024-01-31', 
      eventType: 'click_youtube_live', 
      breakdownBy: 'channel_name' 
    });
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].properties.channel_name).toBe('A');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/@current/events'),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer dummy',
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('should return empty array when no API key is set', async () => {
    // Ensure no API key is set
    delete process.env.POSTHOG_API_KEY;
    
    const result = await fetchYouTubeClicks({ 
      from: '2024-01-01', 
      to: '2024-01-31', 
      eventType: 'click_youtube_live', 
      breakdownBy: 'channel_name' 
    });
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('should handle API errors gracefully', async () => {
    // Mock fetch to return error
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });
    
    global.fetch = mockFetch;

    const result = await fetchYouTubeClicks({ 
      from: '2024-01-01', 
      to: '2024-01-31', 
      eventType: 'click_youtube_live', 
      breakdownBy: 'channel_name' 
    });
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('should handle network errors gracefully', async () => {
    // Mock fetch to throw network error
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    
    global.fetch = mockFetch;

    const result = await fetchYouTubeClicks({ 
      from: '2024-01-01', 
      to: '2024-01-31', 
      eventType: 'click_youtube_live', 
      breakdownBy: 'channel_name' 
    });
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
}); 