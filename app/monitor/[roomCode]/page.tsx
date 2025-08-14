'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function MonitorMode() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const alertTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [sessionData, setSessionData] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  const [currentBlueLevel, setCurrentBlueLevel] = useState(0);
  const [threshold, setThreshold] = useState(0.1);
  const [alertActive, setAlertActive] = useState(false);
  const [alertHistory, setAlertHistory] = useState<Array<{
    timestamp: string;
    level: number;
  }>>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cctvConnected, setCctvConnected] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState<Date | null>(null);

  useEffect(() => {
    initializeSession();
    setupAudio();
    
    return () => {
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setCurrentBlueLevel(data.current_blue_level);
      setCctvConnected(data.cctv_connected);

      // 모니터 연결 상태 업데이트
      await supabase
        .from('active_sessions')
        .update({ monitor_connected: true })
        .eq('room_code', roomCode);

      // Realtime 채널 설정
      setupRealtimeChannel();
    } catch (error) {
      console.error('세션 초기화 실패:', error);
    }
  };

  const setupRealtimeChannel = () => {
    channelRef.current = supabase.channel(`room:${roomCode}`);
    
    // 데이터베이스 변경 감지
    channelRef.current
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'active_sessions',
        filter: `room_code=eq.${roomCode}`
      }, (payload: { new: { current_blue_level: number; blue_threshold: number; cctv_connected: boolean } }) => {
        const newData = payload.new;
        
        // 상태 업데이트
        setCurrentBlueLevel(newData.current_blue_level);
        setThreshold(newData.blue_threshold);
        setCctvConnected(newData.cctv_connected);
        
        // 임계값 초과 확인
        if (newData.current_blue_level > newData.blue_threshold) {
          handleAlert(newData.current_blue_level);
        } else {
          stopAlert();
        }
      })
      // 브로드캐스트 이벤트 수신
      .on('broadcast', { event: 'blue_alert' }, (payload) => {
        console.log('Alert received:', payload);
        handleAlert(payload.payload.level);
      })
      .subscribe();
  };

  const setupAudio = () => {
    // 오디오 요소 생성
    const audio = new Audio();
    audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE';
    audio.loop = true;
    audioRef.current = audio;
  };

  const handleAlert = (level: number) => {
    const now = new Date();
    
    // 이미 알림이 활성화되어 있으면 중복 실행 방지
    if (alertActive) {
      return;
    }
    
    // 30초 쿨다운 체크
    if (lastAlertTime && (now.getTime() - lastAlertTime.getTime()) < 30000) {
      return;
    }
    
    setAlertActive(true);
    setLastAlertTime(now);
    
    // 히스토리에 추가
    setAlertHistory(prev => [{
      timestamp: now.toLocaleTimeString('ko-KR'),
      level: level
    }, ...prev.slice(0, 9)]); // 최대 10개 유지
    
    // 사운드 재생 (soundEnabled 체크)
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0; // 처음부터 재생
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
    
    // 브라우저 알림
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('Wait-a-Minute 알림', {
          body: '대기인원이 발생했습니다!',
          icon: '/icon-192.svg',
          requireInteraction: false,
          tag: 'wait-a-minute-alert'
        });
        
        // 알림 클릭 시 창 포커스
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    } catch (e) {
      console.log('Notification failed:', e);
    }
    
    // 이전 타임아웃 클리어
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
    }
    
    // 10초 후 자동으로 알림 해제
    alertTimeoutRef.current = setTimeout(() => {
      stopAlert();
    }, 10000);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const currentPermission = Notification.permission;
      
      if (currentPermission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // 테스트 알림
          new Notification('알림이 활성화되었습니다', {
            body: '이제 대기인원 발생 시 알림을 받을 수 있습니다.',
            icon: '/icon-192.svg'
          });
        } else if (permission === 'denied') {
          alert('알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해주세요.');
        }
      } else if (currentPermission === 'granted') {
        // 이미 허용됨 - 테스트 알림
        new Notification('알림 테스트', {
          body: '알림이 정상적으로 작동합니다.',
          icon: '/icon-192.svg'
        });
      } else {
        alert('알림 권한이 거부되어 있습니다. 브라우저 설정에서 알림을 허용해주세요.');
      }
    } else {
      alert('이 브라우저는 알림을 지원하지 않습니다.');
    }
  };

  const stopAlert = () => {
    setAlertActive(false);
    
    // 타임아웃 클리어
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
    
    // 오디오 정지
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const cleanup = async () => {
    // 알림 정지
    stopAlert();
    
    // 오디오 정리
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    
    // 채널 구독 해제
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    // 모니터 연결 해제
    await supabase
      .from('active_sessions')
      .update({ monitor_connected: false })
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">모니터링 모드</h1>
            <p className="text-purple-200">룸 코드: {roomCode}</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
          >
            나가기
          </button>
        </div>

        {/* 알림 상태 */}
        {alertActive && (
          <div className="bg-red-500 p-6 rounded-lg mb-6 animate-pulse">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold mb-2">🚨 대기인원이 발생했습니다!</h2>
                <p className="text-lg">파란색 레벨: {(currentBlueLevel * 100).toFixed(2)}%</p>
              </div>
              <button
                onClick={stopAlert}
                className="px-4 py-2 bg-white text-red-500 rounded-lg hover:bg-gray-100"
              >
                알림 끄기
              </button>
            </div>
          </div>
        )}

        {/* 연결 상태 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">연결 상태</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${cctvConnected ? 'bg-green-400' : 'bg-red-400'}`} />
              <span>CCTV: {cctvConnected ? '연결됨' : '연결 안됨'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span>모니터: 연결됨</span>
            </div>
          </div>
        </div>

        {/* 실시간 데이터 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">실시간 모니터링</h2>
          
          {/* 파란색 레벨 게이지 */}
          <div className="mb-4">
            <div className="flex justify-between mb-2">
              <span>파란색 레벨</span>
              <span className="font-bold">{(currentBlueLevel * 100).toFixed(2)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-6 relative overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(currentBlueLevel * 100, 100)}%` }}
              />
              {/* 임계값 표시 */}
              <div 
                className="absolute top-0 bottom-0 w-1 bg-red-500"
                style={{ left: `${threshold * 100}%` }}
              />
            </div>
            <div className="text-sm text-gray-300 mt-1">
              임계값: {(threshold * 100).toFixed(1)}%
            </div>
          </div>

          {/* 상태 표시 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 p-3 rounded">
              <p className="text-sm text-gray-300">현재 상태</p>
              <p className={`font-bold ${alertActive ? 'text-red-400' : 'text-green-400'}`}>
                {alertActive ? '알림 발생' : '정상'}
              </p>
            </div>
            <div className="bg-white/5 p-3 rounded">
              <p className="text-sm text-gray-300">마지막 알림</p>
              <p className="font-bold">
                {lastAlertTime ? lastAlertTime.toLocaleTimeString('ko-KR') : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* 설정 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">설정</h2>
          
          {/* 민감도 조절 */}
          <div className="mb-4">
            <label className="block mb-2">
              민감도 조절 (임계값: {(threshold * 100).toFixed(1)}%)
            </label>
            <input
              type="range"
              min="1"
              max="100"
              step="0.5"
              value={threshold * 100}
              onChange={(e) => updateThreshold(Number(e.target.value) / 100)}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>1% (매우 민감)</span>
              <span>50% (보통)</span>
              <span>100% (매우 둔감)</span>
            </div>
          </div>

          {/* 알림 설정 */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span>소리 알림</span>
              <button
                onClick={() => {
                  const newValue = !soundEnabled;
                  setSoundEnabled(newValue);
                  // 소리를 끄면 현재 재생 중인 소리도 정지
                  if (!newValue && audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                  }
                }}
                className={`w-12 h-6 rounded-full transition-colors ${
                  soundEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  soundEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            
            <div className="flex justify-between items-center">
              <span>브라우저 알림</span>
              <button
                onClick={requestNotificationPermission}
                className="px-3 py-1 bg-purple-600 rounded hover:bg-purple-700"
              >
                권한 요청
              </button>
            </div>
          </div>
        </div>

        {/* 알림 히스토리 */}
        {alertHistory.length > 0 && (
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">알림 히스토리</h2>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {alertHistory.map((alert, index) => (
                <div key={index} className="flex justify-between text-sm bg-white/5 p-2 rounded">
                  <span>{alert.timestamp}</span>
                  <span className="text-yellow-400">
                    레벨: {(alert.level * 100).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}