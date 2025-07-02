import { barChartConfig, pieChartConfig, renderChart } from './chart.util';

describe('chart.util', () => {
  it('should generate bar chart config', () => {
    const config = barChartConfig({
      labels: ['A', 'B'],
      datasets: [{ label: 'Test', data: [1, 2] }],
      title: 'Bar',
      yLabel: 'Y',
    });
    expect(config.type).toBe('bar');
    expect(config.data.labels).toContain('A');
  });

  it('should generate pie chart config', () => {
    const config = pieChartConfig({
      labels: ['A', 'B'],
      data: [1, 2],
      title: 'Pie',
    });
    expect(config.type).toBe('pie');
    expect(config.data.labels).toContain('A');
  });

  it('should render chart as buffer', async () => {
    const config = barChartConfig({
      labels: ['A', 'B'],
      datasets: [{ label: 'Test', data: [1, 2] }],
      title: 'Bar',
      yLabel: 'Y',
    });
    const buf = await renderChart(config);
    expect(buf).toBeInstanceOf(Buffer);
  });
}); 