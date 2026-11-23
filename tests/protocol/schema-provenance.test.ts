import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('../../packages/ocpp-1.6/src/schemas/', import.meta.url);
const EXPECTED: Record<string, string> = {
  'BootNotification.json': '57cedc8c00715439587b6ae71efc4ddc9904048c83d152e7f0f1f60283bc525b',
  'BootNotificationResponse.json': 'abafc062cce4f3d2bad0c7c92ca72c13d69d8f0a7c7f549634848b8cc21d46f9',
  'Heartbeat.json': '83c5b67c13328fcafe90d3ca024e50f82d035f6ef481d917074cce728dfe459f',
  'HeartbeatResponse.json': 'f4df4789381766869c110245854bc47173973684352ed67382ffc9ded018bc21',
};

describe('vendored OCPP 1.6 schemas', () => {
  it.each(Object.entries(EXPECTED))('%s matches the recorded hash', (file, sha) => {
    const actual = createHash('sha256').update(readFileSync(new URL(file, dir))).digest('hex');
    expect(actual).toBe(sha);
  });
  it('SOURCES.md records every hash', () => {
    const doc = readFileSync(new URL('SOURCES.md', dir), 'utf8');
    for (const sha of Object.values(EXPECTED)) expect(doc).toContain(sha);
  });
});
