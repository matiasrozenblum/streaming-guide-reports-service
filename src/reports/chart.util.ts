const QuickChart = require('quickchart-js');

export const themeColors = {
  primary: '#3B82F6',
  secondary: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#FFFFFF',
  text: '#1F2937',
};

export function barChartConfig({
  labels,
  datasets,
  title,
  yLabel = 'Value',
}: {
  labels: string[];
  datasets: { label: string; data: number[] }[];
  title: string;
  yLabel?: string;
}) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((dataset, index) => ({
        ...dataset,
        backgroundColor: [
          themeColors.primary,
          themeColors.secondary,
          themeColors.success,
          themeColors.warning,
          themeColors.danger,
        ][index % 5],
        borderColor: [
          themeColors.primary,
          themeColors.secondary,
          themeColors.success,
          themeColors.warning,
          themeColors.danger,
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
          color: themeColors.text,
          font: {
            size: 16,
            weight: 'bold',
          },
        },
        legend: {
          display: true,
          labels: {
            color: themeColors.text,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: yLabel,
            color: themeColors.text,
          },
          ticks: {
            color: themeColors.text,
          },
          grid: {
            color: '#E5E7EB',
          },
        },
        x: {
          title: {
            display: true,
            text: 'Categories',
            color: themeColors.text,
          },
          ticks: {
            color: themeColors.text,
          },
          grid: {
            color: '#E5E7EB',
          },
        },
      },
    },
  };
}

export function pieChartConfig({
  labels,
  data,
  title,
}: {
  labels: string[];
  data: number[];
  title: string;
}) {
  return {
    type: 'pie',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            themeColors.primary,
            themeColors.secondary,
            themeColors.success,
            themeColors.warning,
            themeColors.danger,
          ],
          borderColor: themeColors.background,
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
          color: themeColors.text,
          font: {
            size: 16,
            weight: 'bold',
          },
        },
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: themeColors.text,
          },
        },
      },
    },
  };
}

export async function renderChart(config: any): Promise<Buffer> {
  const chart = new QuickChart();
  chart.setConfig(config);
  chart.setWidth(800);
  chart.setHeight(400);
  chart.setBackgroundColor(themeColors.background);
  
  const response = await chart.toDataUrl();
  const base64Data = response.split(',')[1];
  return Buffer.from(base64Data, 'base64');
} 