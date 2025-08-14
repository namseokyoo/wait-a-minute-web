'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { detectBlueLevel, BlueDetectionConfig, drawDebugOverlay } from '@/lib/blueDetection';

export default function CCTVMode() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentBlueLevel, setCurrentBlueLevel] = useState(0);
  const [threshold, setThreshold] = useState(0.1);
  const [debugMode, setDebugMode] = useState(false);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);

  useEffect(() => {
    initializeSession();
    return () => {
      cleanup();
    };
  }, []);

  const initializeSession = async () => {
    try {
      // 세션 확인
      const { data, error } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('room_code', roomCode)
        .single();

      if (error || !data) {
        alert('유효하지 않은 룸 코드입니다.');
        router.push('/');
        return;
      }

      setSessionData(data);
      setThreshold(data.blue_threshold);

      // CCTV 연결 상태 업데이트
      await supabase
        .from('active_sessions')
        .update({ cctv_connected: true })
        .eq('room_code', roomCode);

      // Realtime 채널 설정
      setupRealtimeChannel();
    } catch (error) {
      console.error('세션 초기화 실패:', error);
    }
  };

  const setupRealtimeChannel = () => {
    channelRef.current = supabase.channel(`room:${roomCode}`);
    
    channelRef.current
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'active_sessions',
        filter: `room_code=eq.${roomCode}`
      }, (payload: any) => {
        // 임계값 업데이트
        if (payload.new.blue_threshold !== threshold) {
          setThreshold(payload.new.blue_threshold);
        }
      })
      .subscribe();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
        startDetection();
      }
    } catch (error) {
      console.error('카메라 접근 실패:', error);
      alert('카메라 접근 권한이 필요합니다.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setIsStreaming(false);
  };

  const startDetection = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      detectBlue();
    }, 1000); // 1초마다 감지
  };

  const detectBlue = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const config: BlueDetectionConfig = {
      threshold,
      minBlueIntensity: 100,
      debugMode
    };

    const blueLevel = detectBlueLevel(imageData, config);
    setCurrentBlueLevel(blueLevel);

    // 디버그 모드일 때 오버레이 그리기
    if (debugMode && debugCanvasRef.current) {
      debugCanvasRef.current.width = canvas.width;
      debugCanvasRef.current.height = canvas.height;
      drawDebugOverlay(debugCanvasRef.current, imageData, config);
    }

    // 임계값 초과 확인
    if (blueLevel > threshold && !alertTriggered) {
      triggerAlert(blueLevel);
    } else if (blueLevel <= threshold) {
      setAlertTriggered(false);
    }

    // 데이터베이스 업데이트 (1초마다)
    updateBlueLevel(blueLevel);
  };

  const triggerAlert = async (level: number) => {
    setAlertTriggered(true);
    
    // Realtime 브로드캐스트
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'blue_alert',
        payload: { 
          level,
          threshold,
          triggered: true,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  const updateBlueLevel = async (level: number) => {
    await supabase
      .from('active_sessions')
      .update({ 
        current_blue_level: level,
        updated_at: new Date().toISOString()
      })
      .eq('room_code', roomCode);
  };

  const cleanup = async () => {
    stopCamera();
    
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    // CCTV 연결 해제
    await supabase
      .from('active_sessions')
      .update({ cctv_connected: false })
      .eq('room_code', roomCode);
  };

  const updateThreshold = async (newThreshold: number) => {
    setThreshold(newThreshold);
    
    await supabase
      .from('active_sessions')
      .update({ blue_threshold: newThreshold })
      .eq('room_code', roomCode);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">CCTV 모드</h1>
            <p className="text-gray-400">룸 코드: {roomCode}</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
          >
            나가기
          </button>
        </div>

        {/* 비디오 영역 */}
        <div className="relative bg-black rounded-lg overflow-hidden mb-6">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-auto"
          />
          
          {/* 디버그 오버레이 */}
          {debugMode && (
            <canvas
              ref={debugCanvasRef}
              className="absolute top-0 left-0 w-full h-full opacity-50"
            />
          )}
          
          {/* 숨겨진 작업 캔버스 */}
          <canvas
            ref={canvasRef}
            className="hidden"
          />
          
          {/* 알림 표시 */}
          {alertTriggered && (
            <div className="absolute top-4 left-4 right-4 bg-red-500 p-4 rounded-lg animate-pulse">
              <p className="font-bold">파란색 감지됨!</p>
              <p>레벨: {(currentBlueLevel * 100).toFixed(2)}%</p>
            </div>
          )}
        </div>

        {/* 컨트롤 */}
        <div className="space-y-4">
          {/* 시작/정지 버튼 */}
          <div className="flex gap-4">
            <button
              onClick={isStreaming ? stopCamera : startCamera}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                isStreaming 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {isStreaming ? '감지 중지' : '감지 시작'}
            </button>
            
            <button
              onClick={() => setDebugMode(!debugMode)}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                debugMode 
                  ? 'bg-yellow-500 hover:bg-yellow-600' 
                  : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              디버그 {debugMode ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* 상태 표시 */}
          <div className="bg-gray-800 p-4 rounded-lg space-y-3">
            <div className="flex justify-between">
              <span>현재 파란색 레벨:</span>
              <span className={`font-bold ${currentBlueLevel > threshold ? 'text-red-400' : 'text-green-400'}`}>
                {(currentBlueLevel * 100).toFixed(2)}%
              </span>
            </div>
            
            <div className="flex justify-between">
              <span>임계값:</span>
              <span className="font-bold">{(threshold * 100).toFixed(2)}%</span>
            </div>
            
            <div className="flex justify-between">
              <span>상태:</span>
              <span className={`font-bold ${alertTriggered ? 'text-red-400' : 'text-green-400'}`}>
                {alertTriggered ? '알림 발생' : '정상'}
              </span>
            </div>
          </div>

          {/* 민감도 조절 */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <label className="block mb-2">
              민감도 조절 (임계값: {(threshold * 100).toFixed(1)}%)
            </label>
            <input
              type="range"
              min="1"
              max="50"
              step="0.5"
              value={threshold * 100}
              onChange={(e) => updateThreshold(Number(e.target.value) / 100)}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>1% (민감)</span>
              <span>50% (둔감)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}