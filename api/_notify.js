// Push notifications to the owner's phone through ntfy (https://ntfy.sh): free app, no account.
// The phone subscribes to a private topic; NTFY_TOPIC in Vercel holds the same name.
// Files in /api whose names start with "_" are shared code, not endpoints.

// JSON publishing: UTF-8 safe (dashes, degrees) and buttons as a list
export async function push(topic, { title, message, priority, tags, actions, click }, fetchImpl = fetch) {
  if (!topic) return false;
  const r = await fetchImpl('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title, message, priority: priority || 3, tags: [tags || 'bell'], actions: actions || [], ...(click ? { click } : {}) }),
  });
  if (!r.ok) throw new Error('ntfy ' + r.status);
  return true;
}

// The two numbers customers may get texts from; both are the business.
export const NUMBERS_LINE = 'Texts may come from (203) 592-9589 or (203) 560-3572, both are us.';
