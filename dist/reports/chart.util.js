"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.themeColors = void 0;
exports.barChartConfig = barChartConfig;
exports.pieChartConfig = pieChartConfig;
exports.renderChart = renderChart;
const QuickChart = require('quickchart-js');
exports.themeColors = {
    primary: '#3B82F6',
    secondary: '#6B7280',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    background: '#FFFFFF',
    text: '#1F2937',
};
function barChartConfig({ labels, datasets, title, yLabel = 'Value', }) {
    return {
        type: 'bar',
        data: {
            labels,
            datasets: datasets.map((dataset, index) => ({
                ...dataset,
                backgroundColor: [
                    exports.themeColors.primary,
                    exports.themeColors.secondary,
                    exports.themeColors.success,
                    exports.themeColors.warning,
                    exports.themeColors.danger,
                ][index % 5],
                borderColor: [
                    exports.themeColors.primary,
                    exports.themeColors.secondary,
                    exports.themeColors.success,
                    exports.themeColors.warning,
                    exports.themeColors.danger,
                ][index % 5],
                borderWidth: 1,
            })),
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    color: exports.themeColors.text,
                    font: {
                        size: 16,
                        weight: 'bold',
                    },
                },
                legend: {
                    display: true,
                    labels: {
                        color: exports.themeColors.text,
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: yLabel,
                        color: exports.themeColors.text,
                    },
                    ticks: {
                        color: exports.themeColors.text,
                    },
                    grid: {
                        color: '#E5E7EB',
                    },
                },
                x: {
                    title: {
                        display: true,
                        text: 'Categories',
                        color: exports.themeColors.text,
                    },
                    ticks: {
                        color: exports.themeColors.text,
                    },
                    grid: {
                        color: '#E5E7EB',
                    },
                },
            },
        },
    };
}
function pieChartConfig({ labels, data, title, }) {
    return {
        type: 'pie',
        data: {
            labels,
            datasets: [
                {
                    data,
                    backgroundColor: [
                        exports.themeColors.primary,
                        exports.themeColors.secondary,
                        exports.themeColors.success,
                        exports.themeColors.warning,
                        exports.themeColors.danger,
                    ],
                    borderColor: exports.themeColors.background,
                    borderWidth: 2,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    color: exports.themeColors.text,
                    font: {
                        size: 16,
                        weight: 'bold',
                    },
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: exports.themeColors.text,
                    },
                },
            },
        },
    };
}
async function renderChart(config) {
    const chart = new QuickChart();
    chart.setConfig(config);
    chart.setWidth(800);
    chart.setHeight(400);
    chart.setBackgroundColor(exports.themeColors.background);
    const response = await chart.toDataUrl();
    const base64Data = response.split(',')[1];
    return Buffer.from(base64Data, 'base64');
}
//# sourceMappingURL=chart.util.js.map