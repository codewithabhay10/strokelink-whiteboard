/**
 * WebRTCManager
 *
 * Encapsulates the RTCPeerConnection lifecycle and an ordered RTCDataChannel
 * for sending/receiving drawing data with zero server involvement.
 */
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default class WebRTCManager {
  constructor({ onMessage, onIceCandidate, onStateChange }) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.dataChannel = null;
    this._onMessage = onMessage;
    this._onIceCandidate = onIceCandidate;
    this._onStateChange = onStateChange;

    // ── ICE candidate events ──────────────────────────────────────────
    this.pc.onicecandidate = (e) => {
      if (e.candidate && this._onIceCandidate) {
        this._onIceCandidate(e.candidate);
      }
    };

    // ── Connection state tracking ─────────────────────────────────────
    this.pc.onconnectionstatechange = () => {
      if (this._onStateChange) {
        this._onStateChange(this.pc.connectionState);
      }
    };

    // ── Handle incoming data channel (answerer side) ──────────────────
    this.pc.ondatachannel = (e) => {
      this._setupDataChannel(e.channel);
    };
  }

  // ── Create offer (caller / room creator) ────────────────────────────
  async createOffer() {
    // Create the data channel before creating the offer
    const channel = this.pc.createDataChannel('drawing', { ordered: true });
    this._setupDataChannel(channel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  // ── Handle incoming offer (answerer / joiner) ───────────────────────
  async handleOffer(offer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  // ── Handle incoming answer (caller) ─────────────────────────────────
  async handleAnswer(answer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  // ── Add ICE candidate ───────────────────────────────────────────────
  async addIceCandidate(candidate) {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Failed to add ICE candidate:', err);
    }
  }

  // ── Send JSON data over the DataChannel ─────────────────────────────
  send(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  // ── Internal: wire up data channel events ───────────────────────────
  _setupDataChannel(channel) {
    this.dataChannel = channel;
    channel.onopen = () => {
      console.log('[DataChannel] Open');
      if (this._onStateChange) this._onStateChange('connected');
    };
    channel.onclose = () => {
      console.log('[DataChannel] Closed');
      if (this._onStateChange) this._onStateChange('disconnected');
    };
    channel.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (this._onMessage) this._onMessage(parsed);
      } catch (err) {
        console.warn('[DataChannel] Failed to parse message:', err);
      }
    };
  }

  // ── Cleanup ─────────────────────────────────────────────────────────
  destroy() {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    this.pc.close();
  }
}
