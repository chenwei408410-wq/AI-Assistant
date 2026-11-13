import { test, expect } from '@playwright/test';
async function mockDevices(page, denied=false) {
  await page.addInitScript(({denied}) => {
    window.voiceTest = { stopped: 0, closed: 0, events: [] };
    window.addEventListener('zhiyin:avatar', e => window.voiceTest.events.push(e.detail.state));
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    navigator.mediaDevices.getUserMedia = async () => {
      if (denied) throw new DOMException('Permission denied', 'NotAllowedError');
      return { getTracks: () => [{ stop: () => window.voiceTest.stopped++ }] };
    };
    window.RTCPeerConnection = class {
      addTrack() {}
      createDataChannel() { this.channel = {close() {}}; window.voiceTest.channel = this.channel; return this.channel; }
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }; }
      async setLocalDescription() {}
      async setRemoteDescription() { this.channel.onopen(); }
      close() { window.voiceTest.closed++; }
    };
  }, {denied});
}
async function start(page) {
  await page.goto('/');
  await page.getByRole('button',{name:'打开实时语音'}).last().click();
  await page.getByLabel('语音访问口令').fill('test-access-token');
  await page.getByRole('button',{name:'允许麦克风并连接'}).click();
}
test('语音连接、转写、人物事件及断开资源清理', async({page})=>{
  await mockDevices(page);
  await page.route('**/api/realtime', async route => {
    expect(route.request().headers()['x-voice-token']).toBe('test-access-token');
    expect(route.request().postData()).toContain('m=audio');
    await route.fulfill({status:200,contentType:'application/sdp',body:'v=0\r\n'});
  });
  await start(page); await expect(page.getByRole('status')).toHaveText('已连接 · 可以开始说话');
  await page.evaluate(()=>{
    const send = data => window.voiceTest.channel.onmessage({data:JSON.stringify(data)});
    send({type:'output_audio_buffer.started'});
    send({type:'conversation.item.input_audio_transcription.completed',item_id:'u1',transcript:'帮我安排今天的工作'});
    send({type:'response.output_audio_transcript.done',item_id:'a1',transcript:'好的，我们先整理优先级。'});
    send({type:'response.output_audio_transcript.done',item_id:'a1',transcript:'好的，我们先整理优先级。'});
    send({type:'output_audio_buffer.stopped'});
    window.voiceTest.channel.close = () => {};
  });
  await page.getByRole('button',{name:'对话',exact:true}).click();
  await expect(page.locator('.message.user')).toHaveText('帮我安排今天的工作');
  await expect(page.locator('.message.assistant')).toHaveCount(2);
  await page.getByRole('button',{name:'断开语音'}).click();
  await expect(page.getByRole('status')).toHaveText('尚未连接');
  expect(await page.evaluate(()=>({stopped:window.voiceTest.stopped,closed:window.voiceTest.closed,events:window.voiceTest.events}))).toMatchObject({stopped:1,closed:1,events:expect.arrayContaining(['speaking','listening','idle'])});
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('test-access-token');
});
test('麦克风被拒绝时显示明确提示，不调用服务端',async({page})=>{
  await mockDevices(page,true); let called=false;
  await page.route('**/api/realtime',()=>{called=true});
  await start(page);await expect(page.getByRole('alert')).toContainText('未获得麦克风权限');expect(called).toBe(false);
});
test('服务端错误会停止麦克风并允许重试',async({page})=>{
  await mockDevices(page);
  await page.route('**/api/realtime',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'语音服务尚未配置，请联系网站管理员。'})}));
  await start(page);await expect(page.getByRole('alert')).toContainText('尚未配置');
  expect(await page.evaluate(()=>window.voiceTest.stopped)).toBe(1);
});
test('取消正在建立的连接会停止麦克风',async({page})=>{
  await mockDevices(page);
  await page.route('**/api/realtime',()=>{});
  await start(page);await expect(page.getByRole('status')).toContainText('正在连接');
  await page.evaluate(()=>{window.voiceTest.channel.close=()=>{}});
  await page.getByRole('button',{name:'取消连接'}).click();
  await expect(page.getByRole('status')).toHaveText('尚未连接');
  expect(await page.evaluate(()=>window.voiceTest.stopped)).toBe(1);
});
