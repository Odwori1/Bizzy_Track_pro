import morgan from 'morgan';

// Custom format that includes timestamps
const logger = morgan((tokens, req, res) => {
  return [
    `📥 ${new Date().toISOString()}`,
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    '-',
    tokens['response-time'](req, res), 'ms',
    '-',
    req.ip,
    req.get('User-Agent')
  ].join(' ');
});

export default logger;
