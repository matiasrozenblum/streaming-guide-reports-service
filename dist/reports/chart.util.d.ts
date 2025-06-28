export declare const themeColors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    danger: string;
    background: string;
    text: string;
};
export declare function barChartConfig({ labels, datasets, title, yLabel, }: {
    labels: string[];
    datasets: {
        label: string;
        data: number[];
    }[];
    title: string;
    yLabel?: string;
}): {
    type: string;
    data: {
        labels: string[];
        datasets: {
            backgroundColor: string;
            borderColor: string;
            borderWidth: number;
            label: string;
            data: number[];
        }[];
    };
    options: {
        responsive: boolean;
        plugins: {
            title: {
                display: boolean;
                text: string;
                color: string;
                font: {
                    size: number;
                    weight: string;
                };
            };
            legend: {
                display: boolean;
                labels: {
                    color: string;
                };
            };
        };
        scales: {
            y: {
                beginAtZero: boolean;
                title: {
                    display: boolean;
                    text: string;
                    color: string;
                };
                ticks: {
                    color: string;
                };
                grid: {
                    color: string;
                };
            };
            x: {
                title: {
                    display: boolean;
                    text: string;
                    color: string;
                };
                ticks: {
                    color: string;
                };
                grid: {
                    color: string;
                };
            };
        };
    };
};
export declare function pieChartConfig({ labels, data, title, }: {
    labels: string[];
    data: number[];
    title: string;
}): {
    type: string;
    data: {
        labels: string[];
        datasets: {
            data: number[];
            backgroundColor: string[];
            borderColor: string;
            borderWidth: number;
        }[];
    };
    options: {
        responsive: boolean;
        plugins: {
            title: {
                display: boolean;
                text: string;
                color: string;
                font: {
                    size: number;
                    weight: string;
                };
            };
            legend: {
                display: boolean;
                position: string;
                labels: {
                    color: string;
                };
            };
        };
    };
};
export declare function renderChart(config: any): Promise<Buffer>;
