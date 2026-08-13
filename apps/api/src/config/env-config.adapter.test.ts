import { afterEach, describe, expect, it } from 'vitest';
import { EnvConfigAdapter } from './env-config.adapter';

const originalHost = process.env.HOST;
const originalPort = process.env.PORT;

afterEach(() => {
  if (originalHost === undefined) delete process.env.HOST;
  else process.env.HOST = originalHost;

  if (originalPort === undefined) delete process.env.PORT;
  else process.env.PORT = originalPort;
});

describe('EnvConfigAdapter runtime binding', () => {
  it('defaults to loopback and the API default port', () => {
    delete process.env.HOST;
    delete process.env.PORT;
    const config = new EnvConfigAdapter();

    expect(config.getHost()).toBe('127.0.0.1');
    expect(config.getPort()).toBe(8788);
  });

  it('accepts an explicit host and valid port', () => {
    process.env.HOST = ' 0.0.0.0 ';
    process.env.PORT = '9000';
    const config = new EnvConfigAdapter();

    expect(config.getHost()).toBe('0.0.0.0');
    expect(config.getPort()).toBe(9000);
  });

  it('falls back when the port is invalid', () => {
    process.env.PORT = 'not-a-port';
    expect(new EnvConfigAdapter().getPort()).toBe(8788);

    process.env.PORT = '70000';
    expect(new EnvConfigAdapter().getPort()).toBe(8788);
  });
});
