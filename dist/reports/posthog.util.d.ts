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
export declare function fetchYouTubeClicks(eventType: 'click_youtube_live' | 'click_youtube_deferred', from: string, to: string, limit?: number): Promise<PostHogClickEvent[]>;
export declare function aggregateClicksBy(events: PostHogClickEvent[], groupBy: 'channel_name' | 'program_name'): Promise<Record<string, number>>;
export declare function testPostHogConnection(): Promise<{
    success: boolean;
    message: string;
    details?: any;
}>;
export declare function validatePostHogConfig(): {
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
};
