# Wait-a-Minute - 대기인원 감지 시스템

실시간으로 파란색 표시등을 감지하여 대기인원 발생을 원격으로 알려주는 웹 애플리케이션입니다.

## ✨ 기능

- **CCTV 모드**: 카메라로 파란색 픽셀을 실시간 감지
- **모니터링 모드**: 파란색 감지 시 실시간 알림 수신
- **실시간 통신**: Supabase Realtime을 통한 즉각적인 데이터 동기화
- **민감도 조절**: 파란색 감지 임계값 실시간 조절
- **PWA 지원**: 백그라운드 작동 및 푸시 알림

## 🛠 기술 스택

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Supabase (Realtime, Database)
- **Deployment**: Vercel
- **PWA**: Service Worker, Web Push API

## 📦 설치 및 실행

### 1. 클론 및 의존성 설치
```bash
git clone https://github.com/namseokyoo/wait-a-minute-web.git
cd wait-a-minute-web
npm install
```

### 2. 환경 변수 설정
`.env.local` 파일 생성:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. 개발 서버 실행
```bash
npm run dev
```

## 📱 사용 방법

1. **룸 생성**: 메인 페이지에서 "룸 코드 생성" 클릭
2. **CCTV 모드**: 생성된 룸 코드로 CCTV 모드 진입 → 카메라 권한 허용 → "감지 시작"
3. **모니터링 모드**: 동일한 룸 코드로 모니터링 모드 진입
4. **파란색 감지**: CCTV가 파란색을 감지하면 모니터링 모드에서 실시간 알림

## 🚀 Vercel 배포

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/namseokyoo/wait-a-minute-web)

배포 시 환경 변수 설정 필요:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
