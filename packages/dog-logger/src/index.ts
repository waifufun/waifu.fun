import { createLogger, format, transports } from 'winston'

export const DogLogger = createLogger({
  level: 'info',
  exitOnError: false,
  format: format.json(),
  transports: [
    new transports.File({ filename: `/logs/logs.log` }),
  ],
});