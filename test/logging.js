const winston = require('winston');
const assert = require('assert');
const fs = require('fs');

const { createLogger, format, transports } = winston;
const { combine, timestamp, label, colorize, json, printf } = format;

describe('Truebit OS - Logging', async () => {
  it('it should support console and file formats', () => {
    // https://github.com/winstonjs/winston#logging-levels
    const logger = createLogger({
      format: format.combine(
        format.label({ label: 'console' }),
        format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        json()
      ),

      transports: [
        new winston.transports.File({
          filename: 'combined.log.json'
        })
      ]
    });

    if (process.env.NODE_ENV !== 'production') {
      logger.add(
        new transports.Console({
          format: combine(
            colorize(),
            label({ label: 'console' }),
            timestamp(),
            printf(info => {
              return `${info.timestamp} [${info.label}] ${info.level}: ${
                info.message
              }`;
            })
          )
        })
      );
    }
    logger.log({
      level: 'warn',
      message: 'What time is the testing at?'
    });

    assert(fs.existsSync('./combined.log.json'));

    let logs = fs
      .readFileSync('./combined.log.json')
      .toString()
      .split('\n')
      .filter(defined => {
        return defined;
      })
      .map(logLine => {
        if (logLine) {
          return JSON.parse(logLine);
        }
      });

    // console.log(logs);
  });
});
