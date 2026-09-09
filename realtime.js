// KOSIF Audit Studio — OpenAI Realtime WebRTC client
// The browser never receives the OpenAI API key. It sends its SDP offer to the
// configured Cloudflare Worker endpoint and receives the SDP answer.

export function realtimeSupport() {
  return {
    webrtc: typeof RTCPeerConnection !== 'undefined',
    media: Boolean(navigator?.mediaDevices?.getUserMedia),
    full: typeof RTCPeerConnection !== 'undefined' && Boolean(navigator?.mediaDevices?.getUserMedia)
  };
}

export function createRealtimeAssistant({ endpoint = '', onEvent = () => {} } = {}) {
  let pc = null;
  let dc = null;
  let localStream = null;
  let remoteAudio = null;
  let active = false;
  let muted = false;

  const emit = (type, payload = {}) => onEvent({ type, ...payload });

  async function start() {
    if (active) return true;
    if (!endpoint) throw new Error('REALTIME_ENDPOINT_MISSING');
    if (!realtimeSupport().full) throw new Error('WEBRTC_UNSUPPORTED');

    emit('connecting');
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    pc = new RTCPeerConnection();
    remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    remoteAudio.setAttribute('playsinline', '');
    remoteAudio.style.display = 'none';
    document.body.append(remoteAudio);

    pc.ontrack = (event) => {
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play().catch(() => {});
      emit('remote-audio');
    };

    pc.onconnectionstatechange = () => {
      emit('connection-state', { state: pc?.connectionState ?? 'closed' });
      if (pc?.connectionState === 'connected') {
        active = true;
        emit('connected');
      }
      if (['failed', 'closed', 'disconnected'].includes(pc?.connectionState)) {
        if (active) stop();
      }
    };

    for (const track of localStream.getAudioTracks()) pc.addTrack(track, localStream);

    dc = pc.createDataChannel('oai-events');
    dc.onopen = () => emit('data-open');
    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        emit('event', { data });
        if (data.type === 'response.audio_transcript.delta' || data.type === 'response.output_audio_transcript.delta') {
          emit('assistant-transcript-delta', { text: data.delta ?? '' });
        }
        if (data.type === 'conversation.item.input_audio_transcription.completed') {
          emit('user-transcript', { text: data.transcript ?? '' });
        }
        if (data.type === 'error') emit('error', { message: data.error?.message ?? 'Realtime API error' });
      } catch {
        emit('raw-event', { data: event.data });
      }
    };

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp ?? offer.sdp
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`REALTIME_SESSION_FAILED:${response.status}:${detail.slice(0, 300)}`);
    }

    const answerSdp = await response.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    active = true;
    emit('connected');
    return true;
  }

  function stop() {
    active = false;
    try { dc?.close(); } catch {}
    dc = null;
    try { pc?.close(); } catch {}
    pc = null;
    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;
    if (remoteAudio) {
      try { remoteAudio.pause(); } catch {}
      remoteAudio.srcObject = null;
      remoteAudio.remove();
      remoteAudio = null;
    }
    emit('stopped');
  }

  function setMuted(value) {
    muted = Boolean(value);
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    emit('muted', { muted });
  }

  function send(event) {
    if (!dc || dc.readyState !== 'open') return false;
    dc.send(JSON.stringify(event));
    return true;
  }

  return {
    start,
    stop,
    send,
    setMuted,
    isMuted: () => muted,
    isActive: () => active,
    connectionState: () => pc?.connectionState ?? 'closed'
  };
}
