const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (error, status) => Response.json({ error }, { status, headers });
async function equalSecret(a, b) {
  const encode = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', encode.encode(s))));
  const left = new Uint8Array(x), right = new Uint8Array(y);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json('仅支持 POST 请求。', 405);
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json('不允许跨站语音请求。', 403);
  if (!env.OPENAI_API_KEY || !env.VOICE_ACCESS_TOKEN) return json('语音服务尚未配置，请联系网站管理员。', 503);
  const token = request.headers.get('X-Voice-Token') || '';
  if (token.length > 256 || !await equalSecret(token, env.VOICE_ACCESS_TOKEN)) return json('语音访问口令不正确。', 401);
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim() !== 'application/sdp') return json('需要 SDP 格式的连接请求。', 415);
  if (Number(request.headers.get('Content-Length')) > 65536) return json('连接请求过大。', 413);
  // Stream with a bound rather than trusting Content-Length supplied by the caller.
  const reader = request.body?.getReader();
  if (!reader) return json('缺少连接请求。', 400);
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); return json('连接请求过大。', 413); }
    chunks.push(value);
  }
  const sdp = await new Blob(chunks).text();
  if (!sdp.startsWith('v=0') || !sdp.includes('m=audio')) return json('无效的音频连接请求。', 400);
  const session = {
    type: 'realtime', model: env.OPENAI_REALTIME_MODEL || 'gpt-realtime', max_output_tokens: 1024,
    instructions: '你是知音，一位温暖、可靠的 AI 私人助手。默认使用自然流畅的普通话与用户实时交流，回复简洁，适合语音。明确自己是 AI，不假装真人。不能声称已执行没有工具支持的任务；任务清单目前仅由用户在网页本地操作。',
    audio: {
      input: { transcription: { model: 'gpt-4o-mini-transcribe', language: 'zh' }, turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true } },
      output: { voice: 'marin' }
    }
  };
  const body = new FormData();
  body.set('sdp', sdp); body.set('session', JSON.stringify(session));
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, Accept: 'application/sdp' }, body,
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      // Do not forward upstream details, request payloads, or credentials to the browser.
      return json(response.status === 429 ? '语音服务繁忙或额度不足，请稍后重试。' : '语音连接失败，请管理员检查模型权限和服务配置。', response.status === 429 ? 429 : 502);
    }
    return new Response(await response.text(), { status: 200, headers: { ...headers, 'Content-Type': 'application/sdp' } });
  } catch { return json('语音服务连接超时或暂时不可用，请重试。', 502); }
}
