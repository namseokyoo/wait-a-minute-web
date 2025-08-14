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
  const alertActiveRef = useRef<boolean>(false);
  
  const [sessionData, setSessionData] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  const [currentBlueLevel, setCurrentBlueLevel] = useState(0);
  const [threshold, setThreshold] = useState(0.1);
  const [alertActive, setAlertActiveState] = useState(false);
  
  // alertActive 상태를 설정하고 ref도 업데이트
  const setAlertActive = (value: boolean) => {
    setAlertActiveState(value);
    alertActiveRef.current = value;
  };
  const [alertHistory, setAlertHistory] = useState<Array<{
    timestamp: string;
    level: number;
  }>>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | ''>('default');
  const [cctvConnected, setCctvConnected] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState<Date | null>(null);

  useEffect(() => {
    initializeSession();
    setupAudio();
    checkNotificationPermission();
    
    return () => {
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // 알림 권한 상태 확인
  const checkNotificationPermission = () => {
    if ('Notification' in window) {
      const permission = Notification.permission;
      setNotificationPermission(permission);
      setNotificationEnabled(permission === 'granted');
      
      // localStorage에서 알림 설정 불러오기
      const savedNotificationEnabled = localStorage.getItem('notificationEnabled');
      if (savedNotificationEnabled !== null && permission === 'granted') {
        setNotificationEnabled(savedNotificationEnabled === 'true');
      }
    }
  };

  // soundEnabled가 변경될 때 오디오 처리
  useEffect(() => {
    if (!soundEnabled && audioRef.current && alertActive) {
      // 소리를 끄면 현재 재생 중인 오디오 정지
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [soundEnabled, alertActive]);

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
          console.log(`Alert condition met: ${(newData.current_blue_level * 100).toFixed(2)}% > ${(newData.blue_threshold * 100).toFixed(2)}%`);
          // 알림이 이미 활성화되어 있지 않을 때만 새로 시작
          if (!alertActiveRef.current) {
            handleAlert(newData.current_blue_level);
          }
        } else {
          // 임계값 이하로 떨어지면 알림 중지
          if (alertActiveRef.current) {
            console.log(`Alert condition cleared: ${(newData.current_blue_level * 100).toFixed(2)}% <= ${(newData.blue_threshold * 100).toFixed(2)}%`);
            stopAlert();
          }
        }
      })
      // 브로드캐스트 이벤트 수신
      .on('broadcast', { event: 'blue_alert' }, (payload) => {
        console.log('Alert received:', payload);
        // 알림이 이미 활성화되어 있지 않을 때만 처리
        if (!alertActiveRef.current) {
          handleAlert(payload.payload.level);
        }
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
    if (alertActiveRef.current) {
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
    
    // 진동 알림 (vibrationEnabled 체크)
    if (vibrationEnabled && 'vibrate' in navigator) {
      // 진동 패턴: [진동, 멈춤, 진동, 멈춤, 진동] (밀리초 단위)
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
    
    // 브라우저 알림 (notificationEnabled 체크 추가)
    try {
      if (notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('Wait-a-Minute 알림', {
          body: '대기인원이 발생했습니다!',
          icon: '/icon-192.png',  // .svg를 .png로 변경
          requireInteraction: false,
          tag: 'wait-a-minute-alert',
          silent: false  // 소리 알림 허용
        });
        
        // 알림 클릭 시 창 포커스
        notification.onclick = () => {
          window.focus();
          notification.close();
          stopAlert();  // 알림 클릭 시 알림 중지
        };
        
        // 5초 후 자동으로 닫기 (requireInteraction이 false일 때)
        setTimeout(() => {
          notification.close();
        }, 5000);
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
    try {
      console.log('Notification permission request started');
      
      // 알림 API 지원 확인
      if (!('Notification' in window)) {
        // iOS Safari PWA 확인
        const nav = navigator as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (nav.standalone) {
          alert('iOS에서는 홈 화면에 추가한 후 알림을 사용할 수 있습니다.');
        } else {
          alert('이 브라우저는 알림을 지원하지 않습니다.');
        }
        return;
      }
      
      const currentPermission = Notification.permission;
      console.log('Current permission:', currentPermission);
      setNotificationPermission(currentPermission);
      
      if (currentPermission === 'default') {
        // 권한 요청
        try {
          // 모바일에서는 사용자 제스처가 필요할 수 있음
          const permission = await Notification.requestPermission();
          console.log('New permission:', permission);
          setNotificationPermission(permission);
          
          if (permission === 'granted') {
            setNotificationEnabled(true);
            localStorage.setItem('notificationEnabled', 'true');
            
            // 테스트 알림
            try {
              const notification = new Notification('Wait-a-Minute 알림 활성화', {
                body: '이제 대기인원 발생 시 알림을 받을 수 있습니다.',
                icon: '/icon-192.png',
                tag: 'test-notification'
              });
              
              // 3초 후 자동으로 닫기
              setTimeout(() => {
                notification.close();
              }, 3000);
            } catch (notifError) {
              console.log('Test notification error:', notifError);
            }
            
            alert('알림이 활성화되었습니다!');
          } else if (permission === 'denied') {
            setNotificationEnabled(false);
            localStorage.setItem('notificationEnabled', 'false');
            alert('알림 권한이 거부되었습니다.\n브라우저 설정에서 알림을 허용해주세요.');
          }
        } catch (error) {
          console.error('Permission request error:', error);
          // 모바일 특별 처리
          if (error instanceof TypeError) {
            alert('알림 권한을 요청할 수 없습니다.\n브라우저 설정에서 직접 알림을 허용해주세요.');
          } else {
            alert('알림 권한 요청 중 오류가 발생했습니다.');
          }
        }
      } else if (currentPermission === 'granted') {
        setNotificationEnabled(true);
        localStorage.setItem('notificationEnabled', 'true');
        
        // 테스트 알림
        try {
          const notification = new Notification('알림 테스트', {
            body: '알림이 정상적으로 작동합니다.',
            icon: '/icon-192.png',
            tag: 'test-notification'
          });
          
          // 3초 후 자동으로 닫기
          setTimeout(() => {
            notification.close();
          }, 3000);
        } catch (notifError) {
          console.log('Test notification error:', notifError);
        }
        
        alert('알림이 이미 활성화되어 있습니다!');
      } else if (currentPermission === 'denied') {
        setNotificationEnabled(false);
        localStorage.setItem('notificationEnabled', 'false');
        
        // 모바일/데스크톱별 안내
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          alert('알림 권한이 거부되어 있습니다.\n\n설정 > 사이트 설정 > 알림에서\n이 사이트의 알림을 허용해주세요.');
        } else {
          alert('알림 권한이 거부되어 있습니다.\n\n브라우저 주소창 왼쪽의 자물쇠 아이콘을 클릭하여\n알림 권한을 허용해주세요.');
        }
      }
    } catch (error) {
      console.error('Notification permission error:', error);
      alert('알림 설정 중 오류가 발생했습니다.\n브라우저 설정을 확인해주세요.');
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
    
    // 진동 정지
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
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
    
    // localStorage에 민감도 값 저장
    localStorage.setItem('lastBlueThreshold', newThreshold.toString());
    
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
              알림 기준: 파란색 &gt; {(threshold * 100).toFixed(1)}%
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
              알림 임계값 설정: {(threshold * 100).toFixed(1)}%
            </label>
            <p className="text-sm text-gray-300 mb-3">
              화면의 {(threshold * 100).toFixed(0)}% 이상이 파란색일 때 알림이 발생합니다
            </p>
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
              <span>진동 알림</span>
              <button
                onClick={() => {
                  const newValue = !vibrationEnabled;
                  setVibrationEnabled(newValue);
                  // 진동 테스트
                  if (newValue && 'vibrate' in navigator) {
                    navigator.vibrate(100); // 짧은 진동 테스트
                  }
                }}
                className={`w-12 h-6 rounded-full transition-colors ${
                  vibrationEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  vibrationEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span>브라우저 알림</span>
                {notificationPermission === 'denied' && (
                  <span className="text-xs text-red-400">(권한 거부됨)</span>
                )}
                {notificationPermission === 'default' && (
                  <span className="text-xs text-yellow-400">(권한 필요)</span>
                )}
              </div>
              {notificationPermission === 'granted' ? (
                <button
                  onClick={() => {
                    const newValue = !notificationEnabled;
                    setNotificationEnabled(newValue);
                    localStorage.setItem('notificationEnabled', String(newValue));
                    
                    // 테스트 알림
                    if (newValue) {
                      try {
                        new Notification('알림 활성화', {
                          body: '브라우저 알림이 활성화되었습니다.',
                          icon: '/icon-192.png',
                          tag: 'test'
                        });
                      } catch (e) {
                        console.log('Test notification error:', e);
                      }
                    }
                  }}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    notificationEnabled ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    notificationEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              ) : (
                <button
                  onClick={requestNotificationPermission}
                  className="px-3 py-1 bg-purple-600 rounded hover:bg-purple-700"
                >
                  권한 요청
                </button>
              )}
            </div>
            
            {!('vibrate' in navigator) && (
              <div className="text-sm text-yellow-400 bg-yellow-900/30 p-2 rounded">
                ⚠️ 이 브라우저는 진동을 지원하지 않습니다
              </div>
            )}
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