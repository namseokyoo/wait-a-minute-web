# Vercel 배포 가이드

## 1. Vercel CLI 설치 (선택사항)
```bash
npm i -g vercel
```

## 2. Vercel 배포 명령어
```bash
vercel
```

## 3. 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 설정하세요:

- `NEXT_PUBLIC_SUPABASE_URL`: https://wyoegwafecwdgzhpsdfn.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

## 4. 배포 확인

배포가 완료되면 제공된 URL로 접속하여 애플리케이션을 테스트할 수 있습니다.