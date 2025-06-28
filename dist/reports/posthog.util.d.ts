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
export declare function fetchYouTubeClicks({ from, to, eventType, breakdownBy, limit, }: {
    from: string;
    to: string;
    eventType: 'click_youtube_live' | 'click_youtube_deferred';
    breakdownBy?: 'channel_name' | 'program_name';
    limit?: number;
}): Promise<PostHogClickEvent[]>;
export declare function aggregateClicksBy(events: PostHogClickEvent[], groupBy: 'channel_name' | 'program_name'): Promise<Record<string, number>>;
