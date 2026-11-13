import { useCallback, useEffect, useRef, useState } from 'react';

// Stable animation boundary: a later avatar renderer can subscribe without changing transport.
function avatarEvent(detail) {
  window.dispatchEvent(new CustomEvent('zhiyin:avatar', { detail }));
}
export function useRealtimeVoice(onTranscript) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [needsPlayback, setNeedsPlayback] = useState(false);
  const active = useRef(null), callback = useRef(onTranscript);
  callback.current = onTranscript;
  const release = useCallback(() => {
    const current = active.current;
    active.current = null;
    if (current) {
      clearTimeout(current.timeout);
      current.abort.abort();
      current.channel?.close();
      current.peer?.close();
      current.stream?.getTracks().forEach(t => t.stop());
      current.audio.pause(); current.audio.srcObject = null;
    }
    setNeedsPlayback(false);
    avatarEvent({ state: 'idle' });
  }, []);
  const disconnect = useCallback(() => { release(); setStatus('idle'); setError(''); }, [release]);
  useEffect(() => () => release(), [release]);
  useEffect(() => {
    const leave = () => disconnect();
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [disconnect]);
  const connect = useCallback(async token => {
    if (active.current) return;
    setError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setError('实时语音需要 HTTPS、安全的浏览器和麦克风支持。'); setStatus('error'); return;
    }
    const current = { abort: new AbortController(), audio: new Audio(), seen: new Set() };
    active.current = current;
    current.audio.autoplay = true;
    current.audio.setAttribute('playsinline', '');
    const valid = () => active.current === current;
    const fail = message => { if (valid()) { release(); setError(message); setStatus('error'); } };
    // Unlock playback during the explicit click for Safari; retry control handles stricter policies.
    current.audio.play().catch(() => {});
    setStatus('requesting');
    try {
      current.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!valid()) { current.stream.getTracks().forEach(t => t.stop()); return; }
      setStatus('connecting');
      current.timeout = setTimeout(() => fail('连接超时，请检查网络后重试。'), 30000);
      const peer = current.peer = new RTCPeerConnection();
      current.stream.getTracks().forEach(track => peer.addTrack(track, current.stream));
      peer.ontrack = event => {
        if (!valid()) return;
        current.audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        current.audio.play().catch(() => { if (valid()) setNeedsPlayback(true); });
      };
      peer.onconnectionstatechange = () => {
        if (!valid()) return;
        if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) fail('语音连接已中断，请重新连接。');
      };
      const channel = current.channel = peer.createDataChannel('oai-events');
      channel.onopen = () => { if (valid()) { clearTimeout(current.timeout); setStatus('connected'); avatarEvent({ state: 'listening' }); } };
      channel.onclose = () => fail('语音连接已关闭。');
      channel.onmessage = event => {
        if (!valid()) return;
        let data; try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === 'error') { fail('语音服务出现错误，请重新连接。'); return; }
        if (data.type === 'input_audio_buffer.speech_started') avatarEvent({ state: 'listening' });
        if (data.type === 'output_audio_buffer.started') avatarEvent({ state: 'speaking' });
        if (['output_audio_buffer.stopped', 'output_audio_buffer.cleared'].includes(data.type)) avatarEvent({ state: 'listening' });
        if (data.type === 'response.output_audio.delta') avatarEvent({ state: 'speaking', audio: data.delta });
        const user = data.type === 'conversation.item.input_audio_transcription.completed';
        const assistant = data.type === 'response.output_audio_transcript.done';
        if ((user || assistant) && data.transcript?.trim()) {
          const key = `${data.type}:${data.item_id || data.response_id || data.event_id}`;
          if (!current.seen.has(key)) { current.seen.add(key); callback.current({ role: user ? 'user' : 'assistant', text: data.transcript, source: 'voice' }); }
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch('/api/realtime', { method: 'POST', headers: { 'Content-Type': 'application/sdp', 'X-Voice-Token': token }, body: offer.sdp, signal: current.abort.signal });
      if (!valid()) return;
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '语音接口不可用，请确认已部署 Cloudflare Pages Functions。');
      }
      const sdp = await response.text();
      if (!valid()) return;
      await peer.setRemoteDescription({ type: 'answer', sdp });
    } catch (e) {
      if (!valid()) return;
      fail(e.name === 'NotAllowedError' ? '未获得麦克风权限。请在浏览器设置中允许麦克风后重试。' : e.name === 'NotFoundError' ? '未检测到麦克风，请连接音频设备。' : e.message || '语音连接失败，请重试。');
    }
  }, [release]);
  async function resumePlayback() {
    try { await active.current?.audio.play(); setNeedsPlayback(false); } catch { setError('音频播放受限，请检查浏览器声音设置。'); }
  }
  return { status, error, needsPlayback, connect, disconnect, resumePlayback };
}
