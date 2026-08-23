import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { api, CallSignal, User } from "./api";

type Peer = { uid: number; name: string; avatar?: string };
type Phase = "idle" | "calling" | "incoming" | "connected";

export function VideoCall({ me, peer, report, autoStart = false, onEnded }: { me: User | null; peer: Peer | null; report: (message: string) => void; autoStart?: boolean; onEnded?: (reason: "ended" | "offline") => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [remotePeer, setRemotePeer] = useState<Peer | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [offline, setOffline] = useState(false);
  const phaseRef = useRef<Phase>("idle");
  const callIdRef = useRef("");
  const peerRef = useRef<Peer | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingOfferRef = useRef<CallSignal | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const lastSignalRef = useRef(0);

  const changePhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const reset = () => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    callIdRef.current = "";
    peerRef.current = null;
    pendingOfferRef.current = null;
    pendingIceRef.current = [];
    setRemotePeer(null);
    setMuted(false);
    setCameraOff(false);
    setOffline(false);
    changePhase("idle");
  };

  const sendSignal = (type: "offer" | "answer" | "ice" | "reject" | "hangup" | "busy", payload: any = {}, target = peerRef.current?.uid, callId = callIdRef.current) => {
    if (!target || !callId) return Promise.resolve(null);
    return api.sendCallSignal({ recipientId: target, callId, type, payload });
  };

  const acquireMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持视频通话");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  const createConnection = async () => {
    const config = await api.callConfig().catch(() => ({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }));
    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignal("ice", event.candidate.toJSON()).catch(() => undefined);
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") changePhase("connected");
      if (pc.connectionState === "failed") {
        reset();
        report("视频通话连接失败");
      }
    };
    return pc;
  };

  const flushIce = async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    const candidates = pendingIceRef.current.splice(0);
    for (const candidate of candidates) await pc.addIceCandidate(candidate).catch(() => undefined);
  };

  const startCall = async () => {
    if (!peer || phaseRef.current !== "idle") return;
    const callId = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    callIdRef.current = callId;
    peerRef.current = peer;
    setRemotePeer(peer);
    changePhase("calling");
    setOffline(false);
    try {
      const stream = await acquireMedia();
      const pc = await createConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal("offer", offer);
    } catch (error: any) {
      reset();
      report(error?.message || "无法启动视频通话，请检查摄像头和麦克风权限");
    }
  };

  useEffect(() => {
    if (phase !== "calling") return;
    const timer = window.setTimeout(() => {
      void sendSignal("hangup").catch(() => undefined);
      reset();
      setOffline(true);
      onEnded?.("offline");
    }, 18000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (autoStart && peer && phaseRef.current === "idle") void startCall();
  }, [autoStart, peer?.uid]);

  const acceptCall = async () => {
    const offerSignal = pendingOfferRef.current;
    if (!offerSignal) return;
    callIdRef.current = offerSignal.call_id;
    peerRef.current = { uid: offerSignal.sender_id, name: offerSignal.sender, avatar: offerSignal.sender_avatar };
    try {
      const stream = await acquireMedia();
      const pc = await createConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(offerSignal.payload);
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal("answer", answer);
      changePhase("connected");
    } catch (error: any) {
      await sendSignal("reject").catch(() => undefined);
      reset();
      report(error?.message || "无法接听视频通话");
    }
  };

  const rejectCall = async () => {
    const incoming = pendingOfferRef.current;
    if (incoming) await sendSignal("reject", {}, incoming.sender_id, incoming.call_id).catch(() => undefined);
    reset();
    onEnded?.("offline");
  };

  const hangUp = async () => {
    await sendSignal("hangup").catch(() => undefined);
    reset();
    onEnded?.("ended");
  };

  useEffect(() => {
    if (!me) return;
    let stopped = false;
    const poll = async () => {
      try {
        const signals = await api.callSignals(lastSignalRef.current);
        for (const signal of signals) {
          lastSignalRef.current = Math.max(lastSignalRef.current, signal.id);
          if (signal.type === "offer") {
            if (phaseRef.current !== "idle") {
              if (signal.call_id !== callIdRef.current) void sendSignal("busy", {}, signal.sender_id, signal.call_id).catch(() => undefined);
              continue;
            }
            pendingOfferRef.current = signal;
            peerRef.current = { uid: signal.sender_id, name: signal.sender, avatar: signal.sender_avatar };
            callIdRef.current = signal.call_id;
            setRemotePeer(peerRef.current);
            changePhase("incoming");
            continue;
          }
          if (signal.call_id !== callIdRef.current) continue;
          if (signal.type === "answer" && pcRef.current) {
            await pcRef.current.setRemoteDescription(signal.payload);
            await flushIce();
            changePhase("connected");
          } else if (signal.type === "ice") {
            if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(signal.payload).catch(() => undefined);
            else pendingIceRef.current.push(signal.payload);
          } else if (signal.type === "reject" || signal.type === "busy" || signal.type === "hangup") {
            const message = signal.type === "busy" ? "对方正在通话中" : signal.type === "reject" ? "对方不在线或已拒绝通话" : "视频通话已结束";
            reset();
            if (signal.type === "reject") setOffline(true);
            if (signal.type === "reject") onEnded?.("offline");
            if (signal.type === "hangup") onEnded?.("ended");
            report(message);
          }
        }
      } catch {
        // Temporary polling failures should not terminate an active peer connection.
      }
      if (!stopped) window.setTimeout(poll, 1000);
    };
    void poll();
    return () => { stopped = true; reset(); };
  }, [me?.id]);

  useEffect(() => {
    if (localVideoRef.current && streamRef.current) localVideoRef.current.srcObject = streamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
  }, [phase]);

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOff;
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next; });
    setCameraOff(next);
  };

  return <>
    {offline && peer && <div className="video-call-offline"><div className="offline-avatar">{peer.avatar ? <img src={peer.avatar} alt="" /> : peer.name.slice(0, 1)}</div><strong>{peer.name}</strong><span>对方不在线</span><button className="plain" onClick={() => { setOffline(false); void startCall(); }}><Phone />重新呼叫</button></div>}
      {phase === "idle" && peer && (
        <button type="button" className="video-call-start" onClick={startCall} title="发起视频通话">
          <Video size={17} />
          <span>视频通话</span>
        </button>
      )}
    {phase === "incoming" && remotePeer && <div className="video-call-layer video-call-incoming">
      <div className="incoming-avatar">{remotePeer.avatar ? <img src={remotePeer.avatar} alt="" /> : remotePeer.name.slice(0, 1)}</div>
      <strong>{remotePeer.name}</strong><span>邀请你进行视频通话</span>
      <div className="video-call-controls"><button className="call-reject" onClick={rejectCall} title="拒绝"><PhoneOff /></button><button className="call-accept" onClick={acceptCall} title="接听"><Phone /></button></div>
    </div>}
    {(phase === "calling" || phase === "connected") && <div className={`video-call-layer ${phase}`}>
      <video className="video-call-remote" ref={remoteVideoRef} autoPlay playsInline />
      <video className="video-call-local" ref={localVideoRef} autoPlay muted playsInline />
      <div className="video-call-head"><strong>{remotePeer?.name}</strong><span>{phase === "calling" ? "等待对方接受邀请" : "视频通话中"}</span></div>
      <div className="video-call-controls">
        <button onClick={toggleMute} title={muted ? "打开麦克风" : "关闭麦克风"}>{muted ? <MicOff /> : <Mic />}<span>{muted ? "麦克风已关" : "麦克风已开"}</span></button>
        <button className="call-reject" onClick={hangUp} title="挂断"><PhoneOff /><span>挂断</span></button>
        <button onClick={toggleCamera} title={cameraOff ? "打开摄像头" : "关闭摄像头"}>{cameraOff ? <VideoOff /> : <Video />}<span>{cameraOff ? "摄像头已关" : "摄像头已开"}</span></button>
      </div>
    </div>}
  </>;
}
