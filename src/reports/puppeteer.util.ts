import puppeteer, { Browser } from 'puppeteer';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.warn('Error closing browser:', error);
      }
    }
    
    console.log('Launching new Puppeteer browser...');
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        timeout: 30000,
      });
      console.log('Puppeteer browser launched successfully');
    } catch (error) {
      console.error('Error launching Puppeteer browser:', error);
      throw new Error(`Failed to launch Puppeteer browser: ${error.message}`);
    }
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      console.log('Closing Puppeteer browser...');
      await browser.close();
      console.log('Puppeteer browser closed successfully');
    } catch (error) {
      console.warn('Error closing browser:', error);
    } finally {
      browser = null;
    }
  }
} 