'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { nanoid } from 'nanoid';

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    // PWA 서비스 워커 등록
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('Service Worker registered:', registration);
        },
        (error) => {
          console.log('Service Worker registration failed:', error);
        }
      );
    }
  }, []);

  const generateRoomCode = () => {
    return nanoid(6).toUpperCase();
  };

  const createRoom = async () => {
    setIsCreating(true);
    try {
      const newRoomCode = generateRoomCode();
      
      // Supabase에 새 세션 생성
      const { error } = await supabase
        .from('active_sessions')
        .insert({
          room_code: newRoomCode,
          cctv_connected: false,
          monitor_connected: false,
          blue_threshold: 0.1,
          current_blue_level: 0
        })
        .select()
        .single();

      if (error) throw error;

      // 룸 코드 표시
      setRoomCode(newRoomCode);
    } catch (error) {
      console.error('룸 생성 실패:', error);
      alert('룸 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = async (mode: 'cctv' | 'monitor') => {
    if (!roomCode || roomCode.length !== 6) {
      alert('올바른 룸 코드를 입력해주세요 (6자리)');
      return;
    }

    setIsJoining(true);
    try {
      // 룸이 존재하는지 확인
      const { data, error } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .single();

      if (error || !data) {
        alert('존재하지 않는 룸 코드입니다.');
        return;
      }

      // 연결 상태 업데이트
      const updateData = mode === 'cctv' 
        ? { cctv_connected: true }
        : { monitor_connected: true };

      await supabase
        .from('active_sessions')
        .update(updateData)
        .eq('room_code', roomCode.toUpperCase());

      // 해당 모드 페이지로 이동
      router.push(`/${mode}/${roomCode.toUpperCase()}`);
    } catch (error) {
      console.error('룸 참가 실패:', error);
      alert('룸 참가에 실패했습니다.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
          Wait-a-Minute
        </h1>
        <p className="text-center text-gray-600 mb-8">
          대기인원 감지 시스템
        </p>

        {/* 룸 생성 섹션 */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">
            새 룸 만들기
          </h2>
          <button
            onClick={createRoom}
            disabled={isCreating}
            className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isCreating ? '생성 중...' : '룸 코드 생성'}
          </button>
          
          {roomCode && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">생성된 룸 코드:</p>
              <p className="text-2xl font-bold text-blue-600 text-center">
                {roomCode}
              </p>
            </div>
          )}
        </div>

        {/* 룸 참가 섹션 */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-gray-700">
            기존 룸 참가
          </h2>
          <input
            type="text"
            placeholder="룸 코드 입력 (6자리)"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4 text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => joinRoom('cctv')}
              disabled={isJoining || !roomCode}
              className="bg-green-500 text-white py-3 px-4 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              CCTV 모드
            </button>
            <button
              onClick={() => joinRoom('monitor')}
              disabled={isJoining || !roomCode}
              className="bg-purple-500 text-white py-3 px-4 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              모니터링 모드
            </button>
          </div>
        </div>

        {/* 설명 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              <span className="font-semibold">CCTV 모드:</span> 카메라로 파란색을 감지합니다
            </p>
            <p>
              <span className="font-semibold">모니터링 모드:</span> 파란색 감지 시 알림을 받습니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}