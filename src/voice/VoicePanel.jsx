import React, { useState } from 'react';
import { Mic, PhoneOff } from 'lucide-react';
const labels = { idle: '尚未连接', requesting: '正在请求麦克风权限…', connecting: '正在连接知音…', connected: '已连接 · 可以开始说话', error: '连接未完成' };
export default function VoicePanel({ voice, onClose }) {
  const [token, setToken] = useState('');
  const active = ['requesting', 'connecting', 'connected'].includes(voice.status);
  return <section className="voice-panel" aria-label="实时语音控制">
    <div className="voice-panel-title"><Mic size={18}/><strong>和知音实时说话</strong>{!active && <button onClick={onClose} aria-label="收起语音面板">×</button>}</div>
    <p role="status">{labels[voice.status]}</p>
    {!active && <><p>连接后，麦克风音频会发送至 OpenAI 处理。语音转写保存在当前浏览器的对话记录中。</p><label>语音访问口令<input type="password" autoComplete="off" maxLength={256} value={token} onChange={e=>setToken(e.target.value)} placeholder="由网站管理员提供"/></label><button className="voice-connect" disabled={!token.trim()} onClick={()=>{voice.connect(token);setToken('')}}>允许麦克风并连接</button></>}
    {active && <button className="voice-disconnect" onClick={voice.disconnect}><PhoneOff size={16}/> {voice.status==='connected'?'断开语音':'取消连接'}</button>}
    {voice.needsPlayback && <button className="voice-connect" onClick={voice.resumePlayback}>点击播放知音的声音</button>}
    {voice.error && <p className="voice-error" role="alert">{voice.error}</p>}
    <small>当前使用静态形象 · 口型与自然表情待接入</small>
  </section>;
}
