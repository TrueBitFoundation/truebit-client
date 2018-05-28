const assert = require('assert');
const fs = require('fs');

// https://github.com/winstonjs/winston
const logger = require('../os/logger');

describe('Truebit OS - Logging', async () => {
  it('it should support console and file formats', () => {
    logger.log({
      level: 'warn',
      message: 'What time is the testing at?'
    });
    assert(fs.existsSync('./combined.log.json'));
    // want json of all logs?
    // console.log(logs);
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
  });
});
