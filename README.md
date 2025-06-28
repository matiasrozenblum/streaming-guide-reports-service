<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>

## Description

**Streaming Guide Reports Service** - A dedicated microservice for generating comprehensive reports and analytics for the Streaming Guide platform. This service handles all heavy report generation tasks including PDF creation, chart generation, and data exports.

### 🏗️ Architecture

This service is part of a microservices architecture that separates heavy report generation from the main backend:

```
┌─────────────────┐    HTTP/REST    ┌──────────────────┐
│   Main Backend  │◄──────────────►│  Reports Service │
│  (Lightweight)  │                 │   (Heavy Deps)   │
│                 │                 │                  │
│ - User Auth     │                 │ - Chart.js       │
│ - CRUD Ops      │                 │ - Puppeteer      │
│ - Basic Stats   │                 │ - PDF Generation │
│ - Fast Build    │                 │ - CSV Generation │
└─────────────────┘                 └──────────────────┘
```

### ✨ Features

- **PDF Report Generation** - Create beautiful PDF reports with charts and analytics
- **Chart Generation** - Generate charts using Chart.js and canvas rendering
- **CSV Exports** - Export data in CSV format for spreadsheet analysis
- **Weekly Summary Reports** - Automated weekly analytics and insights
- **PostHog Integration** - Pull analytics data from PostHog for comprehensive reports
- **Microservice Architecture** - Independent scaling and deployment

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## API Endpoints

### Reports Generation

#### Generate Custom Report
```http
POST /reports/generate
Content-Type: application/json

{
  "type": "users" | "subscriptions" | "weekly-summary",
  "format": "csv" | "pdf",
  "from": "2024-01-01",
  "to": "2024-12-31",
  "channelId": 1,
  "programId": 2,
  "toEmail": "user@example.com"
}
```

#### Download Weekly Summary Report
```http
GET /reports/weekly-summary/download?from=2024-01-01&to=2024-12-31
```

### Response Formats

#### PDF Reports
- Beautiful, formatted PDF documents
- Embedded charts and analytics
- Professional styling and layout
- Includes summary statistics and insights

#### CSV Reports
- Comma-separated values format
- Ready for spreadsheet analysis
- Includes all relevant data fields
- Optimized for data processing

## Environment Variables

Create a `.env` file in the root directory:

```env
# Service Configuration
NODE_ENV=development
PORT=3001

# Puppeteer Configuration
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# PostHog Analytics
POSTHOG_API_KEY=your_private_api_key_here
POSTHOG_API_HOST=https://app.posthog.com

# Database (if needed for direct queries)
DATABASE_URL=your_database_url
```

## Docker Support

### Build and Run with Docker

```bash
# Build the image
docker build -t streaming-guide-reports .

# Run the container
docker run -p 3001:3001 \
  -e POSTHOG_API_KEY=your_key \
  -e POSTHOG_API_HOST=https://app.posthog.com \
  streaming-guide-reports
```

### Docker Compose (Local Development)

```bash
# From the root directory (/Users/matiasrozenblum/repos)
docker-compose -f docker-compose.dev.yml up --build
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

### Railway Deployment

1. **Create a new Railway project** for the reports service
2. **Connect your repository** and set the root directory to `streaming-guide-reports-service`
3. **Set environment variables** in Railway dashboard:
   - `POSTHOG_API_KEY`
   - `POSTHOG_API_HOST`
   - `NODE_ENV=production`
4. **Deploy** - Railway will automatically build and deploy using the Dockerfile

### Self-Hosted Deployment

```bash
# Build for production
npm run build

# Start the service
npm run start:prod
```

### Docker Deployment

```bash
# Build production image
docker build -t streaming-guide-reports:latest .

# Run in production
docker run -d \
  --name reports-service \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e POSTHOG_API_KEY=your_key \
  streaming-guide-reports:latest
```

## Integration with Main Backend

The main backend communicates with this service via HTTP requests. Ensure the main backend has the correct `REPORTS_SERVICE_URL` environment variable set:

```env
REPORTS_SERVICE_URL=http://localhost:3001  # Local development
REPORTS_SERVICE_URL=https://your-reports-service.railway.app  # Production
```

## Development Workflow

1. **Start the service locally:**
   ```bash
   npm run start:dev
   ```

2. **Test endpoints:**
   ```bash
   # Test report generation
   curl -X POST http://localhost:3001/reports/generate \
     -H "Content-Type: application/json" \
     -d '{"type":"users","format":"pdf","from":"2024-01-01","to":"2024-12-31"}'
   ```

3. **View logs:**
   ```bash
   # If using Docker Compose
   docker-compose logs -f reports
   ```

## Troubleshooting

### Common Issues

#### Puppeteer/Chromium Issues
```bash
# Ensure Chromium is installed
sudo apt-get install chromium-browser  # Ubuntu/Debian
brew install chromium  # macOS
```

#### Memory Issues
- Increase Node.js memory limit: `NODE_OPTIONS="--max-old-space-size=4096"`
- Monitor memory usage during PDF generation

#### PostHog Connection Issues
- Verify `POSTHOG_API_KEY` is correct
- Check network connectivity to PostHog API
- Ensure API key has proper permissions

### Health Check

```bash
# Check if service is running
curl http://localhost:3001/health

# Expected response: {"status":"ok"}
```

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Chart.js Documentation](https://www.chartjs.org/docs/)
- [Puppeteer Documentation](https://pptr.dev/)
- [PostHog API Documentation](https://posthog.com/docs/api)

## Support

For questions and support:
- Check the [main backend documentation](../streaming-guide-backend/README.md)
- Review the [Docker Compose setup](../../README-Docker-Compose.md)
- Open an issue in the repository

## License

This project is [MIT licensed](LICENSE). 