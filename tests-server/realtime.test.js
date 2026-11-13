import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/realtime.js';
const originalFetch = globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch});
const env = { OPENAI_API_KEY: 'server-only-test-key', VOICE_ACCESS_TOKEN: 'test-access-token' };
const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
function call({ method='POST', origin='https://example.pages.dev', token=env.VOICE_ACCESS_TOKEN, body=sdp, type='application/sdp', config=env }={}) {
  return onRequest({env:config,request:new Request('https://example.pages.dev/api/realtime',{method,headers:{Origin:origin,'X-Voice-Token':token,'Content-Type':type},...(method==='POST'?{body}:{})})});
}
test('拒绝跨站、无效口令、不支持的方法和未配置服务',async()=>{
  globalThis.fetch=()=>{throw Error('must not contact upstream')};
  assert.equal((await call({method:'GET'})).status,405);
  assert.equal((await call({origin:'https://evil.example'})).status,403);
  assert.equal((await call({token:'wrong'})).status,401);
  assert.equal((await call({config:{}})).status,503);
});
test('验证 SDP 类型和请求体大小',async()=>{
  assert.equal((await call({type:'text/plain'})).status,415);
  assert.equal((await call({body:'not SDP'})).status,400);
  assert.equal((await call({body:'v=0'+'x'.repeat(65536)})).status,413);
});
test('服务端构造中文会话，密钥仅发送给 OpenAI 并只返回 SDP',async()=>{
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/realtime/calls');
    assert.equal(options.headers.Authorization,'Bearer server-only-test-key');
    assert.equal(options.body.get('sdp'),sdp);
    const session=JSON.parse(options.body.get('session'));
    assert.equal(session.type,'realtime');assert.equal(session.model,'gpt-realtime');
    assert.equal(session.audio.input.transcription.language,'zh');
    assert.equal(session.audio.input.turn_detection.create_response,true);
    assert.equal(session.audio.output.voice,'marin');
    return new Response('v=0\r\nanswer',{status:201});
  };
  const res=await call();assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'no-store');
  assert.equal(await res.text(),'v=0\r\nanswer');
});
test('隐藏上游错误和凭据，并处理超时',async()=>{
  globalThis.fetch=async()=>new Response('server-only-test-key',{status:401});
  const res=await call();assert.equal(res.status,502);assert.ok(!(await res.text()).includes(env.OPENAI_API_KEY));
  globalThis.fetch=async()=>new Response('quota details',{status:429});assert.equal((await call()).status,429);
  globalThis.fetch=async()=>{throw new DOMException('Timed out','TimeoutError')};assert.equal((await call()).status,502);
});
