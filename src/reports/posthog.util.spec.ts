require('dotenv').config();
import { fetchYouTubeClicks, aggregateClicksBy } from './posthog.util';

describe('posthog.util', () => {
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
    process.env.POSTHOG_API_KEY = 'dummy';
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ results: [{ event: 'click_youtube_live', properties: { channel_name: 'A' }, timestamp: '2024-01-01T00:00:00Z' }] }),
      ok: true,
      status: 200,
      statusText: 'OK',
    }) as any;
    const result = await fetchYouTubeClicks({ from: '2024-01-01', to: '2024-01-31', eventType: 'click_youtube_live', breakdownBy: 'channel_name' });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].properties.channel_name).toBe('A');
  });
}); 