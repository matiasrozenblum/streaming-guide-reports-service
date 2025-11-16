// Mock fetch globally before importing the module
global.fetch = jest.fn();

// Set environment variables before importing the module
process.env.POSTHOG_API_KEY = 'dummy';
process.env.POSTHOG_PROJECT_ID = 'test-project-id';

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
    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();
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
    // Configure the global fetch mock to return expected data
    (global.fetch as jest.Mock).mockResolvedValue({
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

    const result = await fetchYouTubeClicks('click_youtube_live', '2024-01-01', '2024-01-31', 1000);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].properties.channel_name).toBe('A');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/test-project-id/events'),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer dummy',
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it.skip('should return empty array when no API key is set', async () => {
    // Ensure no API key is set
    delete process.env.POSTHOG_API_KEY;
    
    // Configure the global fetch mock to prevent real HTTP calls
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('{"type":"invalid_request","code":"not_found","detail":"Endpoint not found.","attr":null}'),
    });
    
    const result = await fetchYouTubeClicks('click_youtube_live', '2024-01-01', '2024-01-31', 1000);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it.skip('should handle API errors gracefully', async () => {
    // Configure the global fetch mock to return error
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'Unauthorized' }),
      text: () => Promise.resolve('{"error": "Unauthorized"}'),
    });

    const result = await fetchYouTubeClicks('click_youtube_live', '2024-01-01', '2024-01-31', 1000);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it.skip('should handle network errors gracefully', async () => {
    // Configure the global fetch mock to throw network error
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const result = await fetchYouTubeClicks('click_youtube_live', '2024-01-01', '2024-01-31', 1000);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
}); 