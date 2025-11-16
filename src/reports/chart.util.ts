const QuickChart = require('quickchart-js');

export const themeColors = {
  primary: '#3B82F6',
  secondary: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  grid: '#F3F4F6',
};

// Enhanced color palette with gradients
const barColors = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Orange
  '#EF4444', // Red
  '#8B5CF6', // Purple
];

const pieColors = [
  '#3B82F6', // Blue
  '#6B7280', // Gray
  '#10B981', // Green
  '#F59E0B', // Orange
  '#EF4444', // Red
];

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
  // Generate gradient colors for bars
  const generateBarColors = (data: number[]) => {
    return data.map((_, i) => {
      const color = barColors[i % barColors.length];
      // Create a subtle gradient effect by adjusting opacity
      return color;
    });
  };

  return {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((dataset, index) => ({
        ...dataset,
        backgroundColor: generateBarColors(dataset.data),
        borderColor: generateBarColors(dataset.data).map(c => c),
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 'flex',
        maxBarThickness: 80,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 20,
          right: 20,
          bottom: 20,
          left: 20,
        },
      },
      plugins: {
        title: {
          display: true,
          text: title,
          color: themeColors.primary,
          font: {
            size: 20,
            weight: 'bold',
            family: "'Inter', 'Segoe UI', Arial, sans-serif",
          },
          padding: {
            top: 10,
            bottom: 20,
          },
        },
        legend: {
          display: datasets.length > 1,
          position: 'top',
          labels: {
            color: themeColors.text,
            font: {
              size: 12,
              family: "'Inter', 'Segoe UI', Arial, sans-serif",
            },
            padding: 12,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(31, 41, 55, 0.95)',
          titleColor: '#FFFFFF',
          bodyColor: '#FFFFFF',
          borderColor: themeColors.border,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: true,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: yLabel,
            color: themeColors.textSecondary,
            font: {
              size: 13,
              weight: '600',
              family: "'Inter', 'Segoe UI', Arial, sans-serif",
            },
            padding: { bottom: 10 },
          },
          ticks: {
            color: themeColors.textSecondary,
            font: {
              size: 11,
              family: "'Inter', 'Segoe UI', Arial, sans-serif",
            },
            padding: 8,
          },
          grid: {
            color: themeColors.grid,
            lineWidth: 1,
            drawBorder: false,
          },
        },
        x: {
          position: 'bottom',
          title: {
            display: false,
          },
          ticks: {
            color: themeColors.textSecondary,
            font: {
              size: 11,
              family: "'Inter', 'Segoe UI', Arial, sans-serif",
            },
            maxRotation: 45,
            minRotation: 0,
            padding: 8,
            autoSkip: false,
            mirror: false,
            display: true,
          },
          grid: {
            display: false,
            drawBorder: false,
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
  // Get colors for pie slices, repeating if needed
  const getPieColors = (count: number) => {
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      colors.push(pieColors[i % pieColors.length]);
    }
    return colors;
  };

  const total = data.reduce((sum, val) => sum + val, 0);
  const hasData = total > 0;

  return {
    type: 'pie',
    data: {
      labels,
      datasets: [
        {
          data: hasData ? data : [],
          backgroundColor: getPieColors(labels.length),
          borderColor: themeColors.background,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 20,
          right: 20,
          bottom: 20,
          left: 20,
        },
      },
      plugins: {
        title: {
          display: true,
          text: title,
          color: themeColors.primary,
          font: {
            size: 20,
            weight: 'bold',
            family: "'Inter', 'Segoe UI', Arial, sans-serif",
          },
          padding: {
            top: 10,
            bottom: 20,
          },
        },
        legend: {
          display: hasData,
          position: 'bottom',
          labels: {
            color: themeColors.text,
            font: {
              size: 12,
              family: "'Inter', 'Segoe UI', Arial, sans-serif",
            },
            padding: 15,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(31, 41, 55, 0.95)',
          titleColor: '#FFFFFF',
          bodyColor: '#FFFFFF',
          borderColor: themeColors.border,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (context: any) => {
              const label = context.label || '';
              const value = context.parsed || 0;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              return `${label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
    },
  };
}

export async function renderChart(
  config: any,
  options?: { width?: number; height?: number }
): Promise<Buffer> {
  const chart = new QuickChart();
  chart.setConfig(config);
  
  // Use custom dimensions if provided, otherwise default
  const width = options?.width || 900;
  const height = options?.height || 450;
  
  chart.setWidth(width);
  chart.setHeight(height);
  chart.setBackgroundColor(themeColors.background);
  chart.setDevicePixelRatio(2); // Higher resolution for better quality
  
  const response = await chart.toDataUrl();
  const base64Data = response.split(',')[1];
  return Buffer.from(base64Data, 'base64');
}

// Helper function to render pie charts with optimal aspect ratio
export async function renderPieChart(config: any): Promise<Buffer> {
  return renderChart(config, { width: 700, height: 500 });
}

// Helper function to render bar charts with optimal aspect ratio
export async function renderBarChart(config: any): Promise<Buffer> {
  return renderChart(config, { width: 900, height: 500 });
} 