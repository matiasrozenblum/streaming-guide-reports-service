import { WeeklyReportData } from './weekly-report.service';
import { getBrowser } from './puppeteer.util';
import { themeColors } from './chart.util';
import * as dayjs from 'dayjs';

export async function generateWeeklyReportPdf({
  data,
  charts,
}: {
  data: WeeklyReportData;
  charts: Record<string, string>;
}): Promise<Buffer> {
  return generatePeriodicReportPdf({ data, charts, period: 'weekly' });
}

export async function generatePeriodicReportPdf({
  data,
  charts,
  period,
}: {
  data: WeeklyReportData;
  charts: Record<string, string>;
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
}): Promise<Buffer> {
  const getReportTitle = (period: string) => {
    switch (period) {
      case 'weekly': return 'Reporte Semanal Unificado';
      case 'monthly': return 'Reporte Mensual Unificado';
      case 'quarterly': return 'Reporte Trimestral Unificado';
      case 'yearly': return 'Reporte Anual Unificado';
      default: return 'Reporte Unificado';
    }
  };

  // Helper function to generate summary stats from top lists
  const getTopItem = (items: Array<{ channelName?: string; programName?: string; count: number }>) => {
    if (!items || items.length === 0) return null;
    const top = items[0];
    return {
      name: top.channelName || top.programName || 'N/A',
      count: top.count,
    };
  };

  const topChannelBySubs = getTopItem(data.topChannelsBySubscriptions);
  const topProgramBySubs = getTopItem(data.topProgramsBySubscriptions);
  const topChannelByClicksLive = getTopItem(data.topChannelsByClicksLive);
  const topProgramByClicksLive = getTopItem(data.topProgramsByClicksLive);

  const html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 48px 40px;
            background: #F9FAFB;
            color: ${themeColors.text};
            line-height: 1.6;
            font-size: 14px;
          }
          .header {
            margin-bottom: 40px;
            padding-bottom: 24px;
            border-bottom: 2px solid ${themeColors.border};
          }
          .logo { height: 56px; margin-bottom: 20px; display: block; }
          h1 {
            font-size: 32px;
            font-weight: 700;
            color: ${themeColors.primary};
            margin-bottom: 8px;
            letter-spacing: -0.5px;
          }
          .period {
            font-size: 15px;
            color: ${themeColors.textSecondary};
            font-weight: 500;
          }
          .summary-card {
            background: white;
            border-radius: 12px;
            padding: 28px;
            margin-bottom: 32px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            border: 1px solid ${themeColors.border};
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 24px;
            margin-top: 20px;
          }
          .summary-item {
            text-align: center;
            padding: 16px;
            background: #F9FAFB;
            border-radius: 8px;
          }
          .summary-value {
            font-size: 32px;
            font-weight: 700;
            color: ${themeColors.primary};
            margin-bottom: 4px;
          }
          .summary-label {
            font-size: 13px;
            color: ${themeColors.textSecondary};
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .section {
            margin-bottom: 40px;
            page-break-inside: avoid;
          }
          .section-title {
            font-size: 24px;
            font-weight: 700;
            color: ${themeColors.text};
            margin-bottom: 24px;
            padding-bottom: 12px;
            border-bottom: 2px solid ${themeColors.primary};
            display: inline-block;
          }
          .card {
            background: white;
            border-radius: 12px;
            padding: 28px;
            margin-bottom: 32px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            border: 1px solid ${themeColors.border};
          }
          .card-title {
            font-size: 18px;
            font-weight: 600;
            color: ${themeColors.text};
            margin-bottom: 20px;
          }
          .chart-container {
            margin: 20px 0;
            text-align: center;
          }
          .chart-img {
            width: 100%;
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          }
          .chart-summary {
            margin-top: 16px;
            padding: 12px 16px;
            background: #F9FAFB;
            border-radius: 6px;
            font-size: 13px;
            color: ${themeColors.textSecondary};
            text-align: left;
          }
          .chart-summary strong {
            color: ${themeColors.text};
            font-weight: 600;
          }
          .two-column {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 24px;
            margin-top: 24px;
          }
          .two-column .card {
            margin-bottom: 0;
          }
          h3 {
            font-size: 16px;
            font-weight: 600;
            color: ${themeColors.text};
            margin-bottom: 16px;
            margin-top: 24px;
          }
          .stats-list {
            list-style: none;
            margin-top: 16px;
          }
          .stats-list li {
            padding: 12px 0;
            border-bottom: 1px solid ${themeColors.border};
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .stats-list li:last-child {
            border-bottom: none;
          }
          .stats-list strong {
            color: ${themeColors.text};
            font-weight: 600;
          }
          .stats-list .value {
            color: ${themeColors.primary};
            font-weight: 600;
            font-size: 16px;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 16px;
          }
          th, td {
            border: 1px solid ${themeColors.border};
            padding: 12px 16px;
            text-align: left;
          }
          th {
            background: ${themeColors.primary};
            color: #fff;
            font-weight: 600;
          }
          tr:nth-child(even) {
            background: #F9FAFB;
          }
          @media print {
            body { padding: 20px; }
            .section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="https://laguiadelstreaming.com/img/logo.png" class="logo" alt="Logo" />
          <h1>${getReportTitle(period)}</h1>
          <div class="period">${data.from} a ${data.to}</div>
        </div>

        <div class="summary-card">
          <h2 class="section-title">Resumen General</h2>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-value">${data.totalNewUsers}</div>
              <div class="summary-label">Usuarios Nuevos</div>
            </div>
            <div class="summary-item">
              <div class="summary-value">${data.totalNewSubscriptions}</div>
              <div class="summary-label">Suscripciones Nuevas</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">Usuarios Nuevos</h2>
          <div class="card">
            <div class="card-title">Distribución por Género</div>
            <div class="chart-container">
              <img class="chart-img" src="data:image/png;base64,${charts.usersByGender}" />
            </div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">Suscripciones Nuevas</h2>
          <div class="two-column">
            <div class="card">
              <div class="card-title">Por Género</div>
              <div class="chart-container">
                <img class="chart-img" src="data:image/png;base64,${charts.subsByGender}" />
              </div>
            </div>
            <div class="card">
              <div class="card-title">Por Grupo de Edad</div>
              <div class="chart-container">
                <img class="chart-img" src="data:image/png;base64,${charts.subsByAge}" />
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">Top 5 Canales</h2>
          
          <div class="card">
            <div class="card-title">Por Suscripciones</div>
            <div class="chart-container">
              <img class="chart-img" src="data:image/png;base64,${charts.topChannelsBySubs}" />
              ${topChannelBySubs ? `<div class="chart-summary"><strong>Destacado:</strong> ${topChannelBySubs.name} con ${topChannelBySubs.count} suscripción${topChannelBySubs.count !== 1 ? 'es' : ''}</div>` : ''}
            </div>
          </div>

          <div class="two-column">
            <div class="card">
              <div class="card-title">Clicks en Vivo</div>
              <div class="chart-container">
                <img class="chart-img" src="data:image/png;base64,${charts.topChannelsByClicksLive}" />
                ${topChannelByClicksLive ? `<div class="chart-summary"><strong>Líder:</strong> ${topChannelByClicksLive.name} (${topChannelByClicksLive.count} clicks)</div>` : ''}
              </div>
            </div>
            <div class="card">
              <div class="card-title">Clicks Diferidos</div>
              <div class="chart-container">
                <img class="chart-img" src="data:image/png;base64,${charts.topChannelsByClicksDeferred}" />
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">Top 5 Programas</h2>
          
          <div class="card">
            <div class="card-title">Por Suscripciones</div>
            <div class="chart-container">
              <img class="chart-img" src="data:image/png;base64,${charts.topProgramsBySubs}" />
              ${topProgramBySubs ? `<div class="chart-summary"><strong>Destacado:</strong> ${topProgramBySubs.name} con ${topProgramBySubs.count} suscripción${topProgramBySubs.count !== 1 ? 'es' : ''}</div>` : ''}
            </div>
          </div>

          <div class="two-column">
            <div class="card">
              <div class="card-title">Clicks en Vivo</div>
              <div class="chart-container">
                <img class="chart-img" src="data:image/png;base64,${charts.topProgramsByClicksLive}" />
                ${topProgramByClicksLive ? `<div class="chart-summary"><strong>Líder:</strong> ${topProgramByClicksLive.name} (${topProgramByClicksLive.count} clicks)</div>` : ''}
              </div>
            </div>
            <div class="card">
              <div class="card-title">Clicks Diferidos</div>
              <div class="chart-container">
                <img class="chart-img" src="data:image/png;base64,${charts.topProgramsByClicksDeferred}" />
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
  
  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    // Set a longer timeout for page operations
    page.setDefaultTimeout(60000);
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ 
      format: 'A4', 
      printBackground: true,
      timeout: 60000 
    });
    
    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (error) {
        console.warn('Error closing page:', error);
      }
    }
  }
} 