import webpush from 'web-push';
import { prisma } from '../index.js';

interface PushKeys {
  publicKey: string;
  privateKey: string;
}

let cachedKeys: PushKeys | null = null;

// The VAPID identity is made on the first boot and kept in the database, so every server
// after it reuses the same keys. Nothing has to be pasted into a hosting dashboard.
export async function getPushKeys(): Promise<PushKeys> {
  if (cachedKeys) return cachedKeys;

  const existing = await prisma.pushKey.findUnique({ where: { id: 'vapid' } });
  if (existing) {
    cachedKeys = { publicKey: existing.publicKey, privateKey: existing.privateKey };
    return cachedKeys;
  }

  const generated = webpush.generateVAPIDKeys();
  try {
    await prisma.pushKey.create({
      data: { id: 'vapid', publicKey: generated.publicKey, privateKey: generated.privateKey }
    });
  } catch {
    // Two servers booting at once: the row already exists, read it back.
  }

  const row = await prisma.pushKey.findUniqueOrThrow({ where: { id: 'vapid' } });
  cachedKeys = { publicKey: row.publicKey, privateKey: row.privateKey };
  return cachedKeys;
}

interface Delivery {
  id: string;
  title: string;
  body: string;
  link: string | null;
  kind: string;
}

// Every notification is an HTTPS request the server makes to whatever URL the browser sent us,
// so only the real push relays are accepted — otherwise a member could point the server at its
// own network.
const PUSH_RELAY_HOSTS = [
  'android.googleapis.com',
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'updates.push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
  'web.push.apple.com'
];

export function isPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return PUSH_RELAY_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

async function deliver(memberIds: string[], delivery: Delivery) {
  if (memberIds.length === 0) return;

  const keys = await getPushKeys();
  const subscriptions = (await prisma.pushSubscription.findMany({ where: { memberId: { in: memberIds } } }))
    .filter(sub => isPushEndpoint(sub.endpoint));
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify(delivery);

  await Promise.all(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        {
          TTL: 86400,
          vapidDetails: { subject: 'mailto:support@power111.fit', publicKey: keys.publicKey, privateKey: keys.privateKey }
        }
      );
    } catch (err: any) {
      // 404/410 means the browser threw the subscription away — stop saving it.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error('Push delivery failed:', err?.statusCode || err?.message);
      }
    }
  }));
}

interface NotificationInput {
  kind: string;
  title: string;
  body: string;
  link?: string;
}

// Writes the member's inbox row and pushes it to every device they subscribed from.
// Notification trouble never fails the admin action that caused it.
export async function notifyMember(memberId: string, input: NotificationInput): Promise<boolean> {
  try {
    const record = await prisma.memberNotification.create({
      data: { memberId, kind: input.kind, title: input.title, body: input.body, link: input.link ?? null }
    });
    await deliver([memberId], { id: record.id, title: record.title, body: record.body, link: record.link, kind: record.kind });
    return true;
  } catch (error) {
    console.error('notifyMember failed:', error);
    return false;
  }
}

// branchId null reaches every branch; only ACTIVE members who subscribed get a row at all.
export async function notifyBranchMembers(branchId: string | null, input: NotificationInput): Promise<number> {
  try {
    const members = await prisma.member.findMany({
      where: {
        status: 'ACTIVE',
        pushSubscriptions: { some: {} },
        ...(branchId ? { branchId } : {})
      },
      select: { id: true }
    });
    if (members.length === 0) return 0;

    await Promise.all(members.map(async member => {
      const record = await prisma.memberNotification.create({
        data: { memberId: member.id, kind: input.kind, title: input.title, body: input.body, link: input.link ?? null }
      });
      await deliver([member.id], { id: record.id, title: record.title, body: record.body, link: record.link, kind: record.kind });
    }));
    return members.length;
  } catch (error) {
    console.error('notifyBranchMembers failed:', error);
    return 0;
  }
}
